#!/usr/bin/env node
import { Crs, newBarretenbergApiAsync, RawBuffer } from './index.js';
import createDebug from 'debug';
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { numToUInt32BE } from './serialize/serialize.js';
import { Command } from 'commander';
createDebug.log = console.error.bind(console);
const debug = createDebug('bb.js');
// Maximum we support.
const MAX_CIRCUIT_SIZE = 2 ** 19;
function getJsonData(jsonPath) {
    const json = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(json);
    return parsed;
}
function getBytecode(jsonPath) {
    const parsed = getJsonData(jsonPath);
    const buffer = Buffer.from(parsed.bytecode, 'base64');
    const decompressed = gunzipSync(buffer);
    return decompressed;
}
async function getGates(jsonPath, api) {
    const parsed = getJsonData(jsonPath);
    if (parsed.gates) {
        return +parsed.gates;
    }
    const { total } = await computeCircuitSize(jsonPath, api);
    const jsonData = getJsonData(jsonPath);
    jsonData.gates = total;
    writeFileSync(jsonPath, JSON.stringify(jsonData));
    return total;
}
function getWitness(witnessPath) {
    const data = readFileSync(witnessPath);
    return Buffer.concat([numToUInt32BE(data.length / 32), data]);
}
async function computeCircuitSize(jsonPath, api) {
    debug(`computing circuit size...`);
    const bytecode = getBytecode(jsonPath);
    const [exact, total, subgroup] = await api.acirGetCircuitSizes(new RawBuffer(bytecode));
    return { exact, total, subgroup };
}
async function init(jsonPath, crsPath) {
    const api = await newBarretenbergApiAsync();
    const circuitSize = await getGates(jsonPath, api);
    const subgroupSize = Math.pow(2, Math.ceil(Math.log2(circuitSize)));
    if (subgroupSize > MAX_CIRCUIT_SIZE) {
        throw new Error(`Circuit size of ${subgroupSize} exceeds max supported of ${MAX_CIRCUIT_SIZE}`);
    }
    debug(`circuit size: ${circuitSize}`);
    debug(`subgroup size: ${subgroupSize}`);
    debug('loading crs...');
    // Plus 1 needed! (Move +1 into Crs?)
    const crs = await Crs.new(subgroupSize + 1, crsPath);
    // Important to init slab allocator as first thing, to ensure maximum memory efficiency.
    await api.commonInitSlabAllocator(subgroupSize);
    // Load CRS into wasm global CRS state.
    // TODO: Make RawBuffer be default behaviour, and have a specific Vector type for when wanting length prefixed.
    await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    const acirComposer = await api.acirNewAcirComposer(subgroupSize);
    return { api, acirComposer, circuitSize: subgroupSize };
}
async function initLite() {
    const api = await newBarretenbergApiAsync(1);
    // Plus 1 needed! (Move +1 into Crs?)
    const crs = await Crs.new(1);
    // Load CRS into wasm global CRS state.
    await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    const acirComposer = await api.acirNewAcirComposer(0);
    return { api, acirComposer };
}
export async function proveAndVerify(jsonPath, witnessPath, crsPath, isRecursive) {
    const { api, acirComposer } = await init(jsonPath, crsPath);
    try {
        debug(`creating proof...`);
        const bytecode = getBytecode(jsonPath);
        const witness = getWitness(witnessPath);
        const proof = await api.acirCreateProof(acirComposer, new RawBuffer(bytecode), new RawBuffer(witness), isRecursive);
        debug(`verifying...`);
        const verified = await api.acirVerifyProof(acirComposer, proof, isRecursive);
        console.log(`verified: ${verified}`);
        return verified;
    }
    finally {
        await api.destroy();
    }
}
export async function prove(jsonPath, witnessPath, crsPath, isRecursive, outputPath) {
    const { api, acirComposer } = await init(jsonPath, crsPath);
    try {
        debug(`creating proof...`);
        const bytecode = getBytecode(jsonPath);
        const witness = getWitness(witnessPath);
        const proof = await api.acirCreateProof(acirComposer, new RawBuffer(bytecode), new RawBuffer(witness), isRecursive);
        debug(`done.`);
        writeFileSync(outputPath, proof);
        console.log(`proof written to: ${outputPath}`);
    }
    finally {
        await api.destroy();
    }
}
export async function gateCount(jsonPath) {
    const api = await newBarretenbergApiAsync(1);
    try {
        console.log(`gates: ${await getGates(jsonPath, api)}`);
    }
    finally {
        await api.destroy();
    }
}
export async function verify(proofPath, isRecursive, vkPath) {
    const { api, acirComposer } = await initLite();
    try {
        await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
        const verified = await api.acirVerifyProof(acirComposer, readFileSync(proofPath), isRecursive);
        console.log(`verified: ${verified}`);
        return verified;
    }
    finally {
        await api.destroy();
    }
}
export async function contract(outputPath, vkPath) {
    const { api, acirComposer } = await initLite();
    try {
        await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
        const contract = await api.acirGetSolidityVerifier(acirComposer);
        if (outputPath === '-') {
            console.log(contract);
        }
        else {
            writeFileSync(outputPath, contract);
            console.log(`contract written to: ${outputPath}`);
        }
    }
    finally {
        await api.destroy();
    }
}
export async function writeVk(jsonPath, crsPath, outputPath) {
    const { api, acirComposer } = await init(jsonPath, crsPath);
    try {
        debug('initing proving key...');
        const bytecode = getBytecode(jsonPath);
        await api.acirInitProvingKey(acirComposer, new RawBuffer(bytecode));
        debug('initing verification key...');
        const vk = await api.acirGetVerificationKey(acirComposer);
        if (outputPath === '-') {
            process.stdout.write(vk);
        }
        else {
            writeFileSync(outputPath, vk);
            console.log(`vk written to: ${outputPath}`);
        }
    }
    finally {
        await api.destroy();
    }
}
export async function proofAsFields(proofPath, numInnerPublicInputs, outputPath) {
    const { api, acirComposer } = await initLite();
    try {
        debug('serializing proof byte array into field elements');
        const proofAsFields = await api.acirSerializeProofIntoFields(acirComposer, readFileSync(proofPath), numInnerPublicInputs);
        writeFileSync(outputPath, JSON.stringify(proofAsFields.map(f => f.toString())));
        debug('done.');
    }
    finally {
        await api.destroy();
    }
}
export async function vkAsFields(vkPath, vkeyOutputPath) {
    const { api, acirComposer } = await initLite();
    try {
        debug('serializing vk byte array into field elements');
        await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
        const [vkAsFields, vkHash] = await api.acirSerializeVerificationKeyIntoFields(acirComposer);
        const output = [vkHash, ...vkAsFields].map(f => f.toString());
        writeFileSync(vkeyOutputPath, JSON.stringify(output));
        debug('done.');
    }
    finally {
        await api.destroy();
    }
}
const program = new Command();
program.option('-v, --verbose', 'enable verbose logging', false);
program.option('-c, --crs-path <path>', 'set crs path', './crs');
function handleGlobalOptions() {
    if (program.opts().verbose) {
        createDebug.enable('bb.js*');
    }
}
program
    .command('prove_and_verify')
    .description('Generate a proof and verify it. Process exits with success or failure code.')
    .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
    .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.tr')
    .option('-r, --recursive', 'prove and verify using recursive prover and verifier', false)
    .action(async ({ jsonPath, witnessPath, recursive, crsPath }) => {
    handleGlobalOptions();
    const result = await proveAndVerify(jsonPath, witnessPath, crsPath, recursive);
    process.exit(result ? 0 : 1);
});
program
    .command('prove')
    .description('Generate a proof and write it to a file.')
    .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
    .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.tr')
    .option('-r, --recursive', 'prove using recursive prover', false)
    .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
    .action(async ({ jsonPath, witnessPath, recursive, outputPath, crsPath }) => {
    handleGlobalOptions();
    await prove(jsonPath, witnessPath, crsPath, recursive, outputPath);
});
program
    .command('gates')
    .description('Print gate count to standard output.')
    .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
    .action(async ({ jsonPath }) => {
    handleGlobalOptions();
    await gateCount(jsonPath);
});
program
    .command('verify')
    .description('Verify a proof. Process exists with success or failure code.')
    .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
    .option('-r, --recursive', 'prove using recursive prover', false)
    .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
    .action(async ({ proofPath, recursive, vk }) => {
    handleGlobalOptions();
    const result = await verify(proofPath, recursive, vk);
    process.exit(result ? 0 : 1);
});
program
    .command('contract')
    .description('Output solidity verification key contract.')
    .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
    .option('-o, --output-path <path>', 'Specify the path to write the contract', '-')
    .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
    .action(async ({ outputPath, vk }) => {
    handleGlobalOptions();
    await contract(outputPath, vk);
});
program
    .command('write_vk')
    .description('Output verification key.')
    .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
    .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
    .action(async ({ jsonPath, outputPath, crsPath }) => {
    handleGlobalOptions();
    await writeVk(jsonPath, crsPath, outputPath);
});
program
    .command('proof_as_fields')
    .description('Return the proof as fields elements')
    .requiredOption('-p, --proof-path <path>', 'Specify the proof path')
    .requiredOption('-n, --num-public-inputs <number>', 'Specify the number of public inputs')
    .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the proof fields')
    .action(async ({ proofPath, numPublicInputs, outputPath }) => {
    handleGlobalOptions();
    await proofAsFields(proofPath, numPublicInputs, outputPath);
});
program
    .command('vk_as_fields')
    .description('Return the verifiation key represented as fields elements. Also return the verification key hash.')
    .requiredOption('-i, --input-path <path>', 'Specifies the vk path (output from write_vk)')
    .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the verification key fields and key hash')
    .action(async ({ inputPath, outputPath }) => {
    handleGlobalOptions();
    await vkAsFields(inputPath, outputPath);
});
program.name('bb.js').parse(process.argv);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFDQSxPQUFPLEVBQUUsR0FBRyxFQUF3Qix1QkFBdUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDM0YsT0FBTyxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQ2hDLE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ2pELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDbEMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFFcEMsV0FBVyxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUM5QyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFbkMsc0JBQXNCO0FBQ3RCLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUVqQyxTQUFTLFdBQVcsQ0FBQyxRQUFnQjtJQUNuQyxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzdDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLFFBQWdCO0lBQ25DLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdEQsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FB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