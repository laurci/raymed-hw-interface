import { createBluetooth } from "node-ble";
import { combineLatest, map, Observable, zip } from "rxjs";
const {bluetooth} = createBluetooth();

const MUSE_SERVICE = '0000fe8d-0000-1000-8000-00805f9b34fb';
const CONTROL_CHARACTERISTIC = '273e0001-4c4d-454d-96be-f03bac821358';
const TELEMETRY_CHARACTERISTIC = '273e000b-4c4d-454d-96be-f03bac821358';
const GYROSCOPE_CHARACTERISTIC = '273e0009-4c4d-454d-96be-f03bac821358';
const ACCELEROMETER_CHARACTERISTIC = '273e000a-4c4d-454d-96be-f03bac821358';
const PPG_CHARACTERISTICS = [
    '273e000f-4c4d-454d-96be-f03bac821358', // ambient 0x37-0x39
    '273e0010-4c4d-454d-96be-f03bac821358', // infrared 0x3a-0x3c
    '273e0011-4c4d-454d-96be-f03bac821358', // red 0x3d-0x3f
];
const PPG_FREQUENCY = 64;
const PPG_SAMPLES_PER_READING = 6;
const EEG_CHARACTERISTICS = [
    '273e0003-4c4d-454d-96be-f03bac821358',
    '273e0004-4c4d-454d-96be-f03bac821358',
    '273e0005-4c4d-454d-96be-f03bac821358',
    '273e0006-4c4d-454d-96be-f03bac821358',
];
const EEG_FREQUENCY = 256;
const EEG_SAMPLES_PER_READING = 12;



export async function connect(deviceUuid: string): Promise<Observable<number[]>> {
    const adapter = await bluetooth.defaultAdapter()
    if (!await adapter.isDiscovering())
        await adapter.startDiscovery()

    const device = await adapter.waitDevice(deviceUuid);
    try {
        await device.connect();
        console.log("connected");
        const gatt = await device.gatt();

        const service = await gatt.getPrimaryService(MUSE_SERVICE);
        const controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
        console.log(await controlChar.getFlags());

        function encodeCommand(cmd: string) {
            const lengthByte = cmd.length + 1;
            const cmdBuffer = Buffer.from(cmd, 'utf-8');
            const newlineByte = Buffer.from([10]);
            
            const buffer = Buffer.concat([
                Buffer.from([lengthByte]),
                cmdBuffer,
                newlineByte
            ]);
        
            console.log(buffer);
            return buffer;
        }

        async function observableFromChar(uuid: string) {
            const char = await service.getCharacteristic(uuid);

            const obs = new Observable<Buffer>(subsribe => {
                char.on("valuechanged", (data) => {
                    subsribe.next(data);
                });
            });
            await char.startNotifications();

            return obs;
        }


        let ppgRawBuffers = await Promise.all(PPG_CHARACTERISTICS.map(observableFromChar));
        let ppgValues = ppgRawBuffers.map((raw) => {
            return raw.pipe(map((buffer) => {
                const samples = new Uint8Array(buffer).subarray(2); // skip the first two bytes
                const values = [];
                for (let i = 0; i < samples.length; i = i + 3) {
                    values.push((samples[i] << 16) | (samples[i + 1] << 8) | samples[i + 2]);
                }
                return values;
            }));
        });

        const ppg = zip(ppgValues).pipe(
            map(([ambient, infrared, red]) => {

                const irCorrected = infrared.map((ir, i) => {
                    return ir - ambient[i];
                });

                const redCorrected = red.map((r, i) => {
                    return r - ambient[i];
                });

                // Return all data, including BPM
                return {
                    ambient,
                    infrared,
                    red,
                    irCorrected,
                    redCorrected,
                };
            })
        );

        const eegRawBuffers = await Promise.all(EEG_CHARACTERISTICS.map(observableFromChar));
        const eegValues = eegRawBuffers.map((raw) => {
            return raw.pipe(map((buffer) => {
                const samples = new Uint8Array(buffer).subarray(2); // skip the first two bytes

                const samples12Bit = [];
                for (let i = 0; i < samples.length; i++) {
                    if (i % 3 === 0) {
                        samples12Bit.push((samples[i] << 4) | (samples[i + 1] >> 4));
                    } else {
                        samples12Bit.push(((samples[i] & 0xf) << 8) | samples[i + 1]);
                        i++;
                    }
                }
                return samples12Bit.map((n) => 0.48828125 * (n - 0x800));
            }));
        });
        const eeg = zip(eegValues).pipe(
            map(([tp9, af7, af8, tp10]) => {
                return {
                    tp9,
                    af7,
                    af8,
                    tp10,
                };
            })
        );

        const dataStream = combineLatest([ppg, eeg]).pipe(map(([ppg, eeg]) => {
            // scale all in range -128 to 127

            // ppg is 24bit int
            const ppgIrInt8 = ppg.irCorrected.map((n) => Math.min(127, Math.max(-128, Math.round(n / 2048))));
            const ppgRedInt8 = ppg.redCorrected.map((n) =>  Math.min(127, Math.max(-128, Math.round(n / 2048))));
            
            // eeg is 12bit int
            const eegTp9Int8 = eeg.tp9.map((n) => Math.round(n / 32));
            const eegAf7Int8 = eeg.af7.map((n) => Math.round(n / 32));
            const eegAf8Int8 = eeg.af8.map((n) => Math.round(n / 32));
            const eegTp10Int8 = eeg.tp10.map((n) => Math.round(n / 32));

            const ppgData = ppgIrInt8.flatMap((ir, idx) =>([ir, ppgRedInt8[idx]]));
            const eegData = eegTp9Int8.flatMap((tp9, idx) =>([tp9, eegAf7Int8[idx], eegAf8Int8[idx], eegTp10Int8[idx]]));

            return [...ppgData, ...eegData];
        }));

        await controlChar.writeValueWithoutResponse(encodeCommand("h"));
        await controlChar.writeValueWithoutResponse(encodeCommand("p50"));
        await controlChar.writeValueWithoutResponse(encodeCommand("s"));
        await controlChar.writeValueWithoutResponse(encodeCommand("d"));

        return dataStream;
    } catch(e) {
        await device.disconnect();
        throw e;
    }
}