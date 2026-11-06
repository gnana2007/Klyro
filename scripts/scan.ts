import { scanHook } from "../src/server/scan";
import { writeFileSync } from "node:fs";
const address = process.argv[2];
const chainId = Number(process.argv[3] || 11155111);
if (!address)
  throw new Error("Usage: npm run scan -- 0xADDRESS CHAIN_ID [output.json]");
scanHook({ address, chainId }, (s) => console.error(s))
  .then((result) => {
    const json = JSON.stringify(result, null, 2);
    if (process.argv[4]) writeFileSync(process.argv[4], json);
    else console.log(json);
  })
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
