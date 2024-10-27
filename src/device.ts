import awsIotCore from "aws-iot-device-sdk";
import config from "./config";

export interface IncidentDescriptor {
    patientId: string;
    geoLocation?: {
        lat: number;
        long: number;
    };
    incidentType: "seizure" | "faint"; // Add more types as needed    
}

const device = new awsIotCore.device({
    ...config.aws.iotCore,
    region: config.aws.region,
    keepalive: 20,
    reconnectPeriod: 1000,
});

export function triggerIncidentAlert(desc: IncidentDescriptor) {
    device.publish(
        "raymed",
        JSON.stringify({ message: "incident_call", ...desc }),
        undefined,
        (error: Error | undefined) => {
            if (error) {
                console.error("Publish error", error);
            } else {
                console.log("Message published to raymed");
            }
        }
    );
}