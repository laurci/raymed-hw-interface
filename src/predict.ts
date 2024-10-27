export type Class = "normal" | "faint" | "seizure";

export const DEMO_SEIZURE = Array.from({ length: 60 }).map(() => 125);
export const DEMO_FAINT = Array.from({ length: 60 }).map(() => -125);

export async function calsifyStreamChunk(inputs: number[]): Promise<Class> {
    // todo: stream to fpga for classification

    if (inputs.every(x => x < -120)) {
        return "faint";
    }

    if (inputs.every(x => x > 120)) {
        return "seizure";
    }

    return "normal";
}