import { filter, merge, Subject } from "rxjs";
import express from "express";
import config from "./config";
import { triggerIncidentAlert } from "./device";
import { connect } from "./muse";
import { calsifyStreamChunk, DEMO_FAINT, DEMO_SEIZURE } from "./predict";

async function main() {
    console.log("waiting for muse connection");
    const deviceStream = await connect(config.museDevice);
    console.log("muse connected");

    const triggerSubject = new Subject<number[]>();
    const dataStream = merge(deviceStream, triggerSubject);

    dataStream.pipe(
        filter((_, i) => i % 100 === 0),
    ).subscribe((data) => {
        console.log(data);
    });

    dataStream.subscribe(async (data) => {
        const classification = await calsifyStreamChunk(data);
        if (classification === "normal") return;

        console.log(data, classification);

        triggerIncidentAlert({
            incidentType: classification,
            patientId: config.patientId,
            // TODO: actually get geo location
            geoLocation: {
                lat: 47.048013,
                long: 21.92426
            },
        });
    });

    // this is only for demo purposes
    const demoHttp = express();
    demoHttp.get("/trigger/seizure", (_, res) => {
        triggerSubject.next(DEMO_SEIZURE);
        res.send("triggered seizure\n");
    });

    demoHttp.get("/trigger/faint", (_, res) => {
        triggerSubject.next(DEMO_FAINT);
        res.send("triggered faint\n");
    });

    demoHttp.listen(3000, () => {
        console.log("demo http interface listening on 3000");
    });
}


main();
