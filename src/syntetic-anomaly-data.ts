import { writeFile } from "fs/promises";

async function main() {
    const valuesCount = 60
    const valueSign = 1;
    const cls = "2";

    let output = "";

    for (let i = 0; i < 1000; i++) {
        const values = Array.from({ length: valuesCount }).map(() => (valueSign * 120) + (valueSign * Math.floor(Math.random() * 7))).join(",");
        if (output.includes(values)) {
            i -= 1;
            continue;
        }

        output += values + "," + cls + "\n";
    }

    await writeFile("data.csv", output);
}

main();