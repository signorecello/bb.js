import { TextEncoder } from 'util';
import { Buffer128, Buffer32, Fr, Point } from '../types/index.js';
import { newBarretenbergApiSync } from '../factory/index.js';
describe('schnorr', () => {
    const msg = Buffer.from(new TextEncoder().encode('The quick brown dog jumped over the lazy fox.'));
    let api;
    beforeAll(async () => {
        api = await newBarretenbergApiSync();
        api.pedersenInit();
    });
    afterAll(async () => {
        await api.destroy();
    });
    it('should verify signature', () => {
        const pk = Fr.fromBuffer(new Uint8Array([
            0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7, 0xda, 0x31,
            0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
        ]));
        const pubKey = api.schnorrComputePublicKey(pk);
        const [s, e] = api.schnorrConstructSignature(msg, pk);
        const verified = api.schnorrVerifySignature(msg, pubKey, s, e);
        expect(verified).toBe(true);
    });
    it('public key negation should work', () => {
        const publicKeyStr = '0x164f01b1011a1b292217acf53eef4d74f625f6e9bd5edfdb74c56fd81aafeebb21912735f9266a3719f61c1eb747ddee0cac9917f5c807485d356709b529b62c';
        const publicKey = Point.fromString(publicKeyStr);
        // hardcoded expected negated public key
        const expectedInvertedStr = '0x164f01b1011a1b292217acf53eef4d74f625f6e9bd5edfdb74c56fd81aafeebb0ed3273ce80b35f29e5a2997ca397a6f1b874f3083f16948e6ac8e8a3ad649d5';
        const expectedInverted = Point.fromString(expectedInvertedStr);
        // negate - should match expected negated key
        const negatedPublicKey = api.schnorrNegatePublicKey(publicKey);
        expect(negatedPublicKey.equals(expectedInverted)).toEqual(true);
        // negate again - should be original public key now
        expect(api.schnorrNegatePublicKey(negatedPublicKey).equals(publicKey)).toEqual(true);
    });
    it('should create + verify multi signature', () => {
        // set up multisig accounts
        const numSigners = 7;
        const pks = [...Array(numSigners)].map(() => Fr.random());
        const pubKeys = pks.map(pk => api.schnorrMultisigCreateMultisigPublicKey(pk));
        // round one
        const roundOnePublicOutputs = [];
        const roundOnePrivateOutputs = [];
        for (let i = 0; i < numSigners; ++i) {
            const [publicOutput, privateOutput] = api.schnorrMultisigConstructSignatureRound1();
            roundOnePublicOutputs.push(publicOutput);
            roundOnePrivateOutputs.push(privateOutput);
        }
        // round two
        const roundTwoOutputs = pks.map((pk, i) => api.schnorrMultisigConstructSignatureRound2(msg, pk, roundOnePrivateOutputs[i], pubKeys, roundOnePublicOutputs)[0]);
        // generate signature
        const [s, e] = api.schnorrMultisigCombineSignatures(msg, pubKeys, roundOnePublicOutputs, roundTwoOutputs);
        const [combinedKey] = api.schnorrMultisigValidateAndCombineSignerPubkeys(pubKeys);
        expect(combinedKey).not.toEqual(Buffer.alloc(64));
        const verified = api.schnorrVerifySignature(msg, combinedKey, s, e);
        expect(verified).toBe(true);
    });
    it('should identify invalid multi signature', () => {
        const pks = [...Array(3)].map(() => Fr.random());
        const pubKeys = pks.map(pk => api.schnorrMultisigCreateMultisigPublicKey(pk));
        const [combinedKey] = api.schnorrMultisigValidateAndCombineSignerPubkeys(pubKeys);
        const verified = api.schnorrVerifySignature(msg, combinedKey, Buffer32.random(), Buffer32.random());
        expect(verified).toBe(false);
    });
    it('should not construct invalid multi signature', () => {
        // set up multisig accounts
        const numSigners = 7;
        const pks = [...Array(numSigners)].map(() => Fr.random());
        const pubKeys = pks.map(pk => api.schnorrMultisigCreateMultisigPublicKey(pk));
        // round one
        const roundOnePublicOutputs = [];
        const roundOnePrivateOutputs = [];
        for (let i = 0; i < numSigners; ++i) {
            const [publicOutput, privateOutput] = api.schnorrMultisigConstructSignatureRound1();
            roundOnePublicOutputs.push(publicOutput);
            roundOnePrivateOutputs.push(privateOutput);
        }
        // round two
        const roundTwoOutputs = pks.map((pk, i) => api.schnorrMultisigConstructSignatureRound2(msg, pk, roundOnePrivateOutputs[i], pubKeys, roundOnePublicOutputs)[0]);
        // wrong number of data
        {
            expect(api.schnorrMultisigCombineSignatures(msg, pubKeys.slice(0, -1), roundOnePublicOutputs.slice(0, -1), roundTwoOutputs.slice(0, -1))[2]).toBe(false);
        }
        // invalid round two output
        {
            const invalidOutputs = [...roundTwoOutputs];
            invalidOutputs[1] = api.schnorrMultisigConstructSignatureRound2(msg, pks[2], // <- Wrong private key.
            roundOnePrivateOutputs[1], pubKeys, roundOnePublicOutputs)[0];
            expect(api.schnorrMultisigCombineSignatures(msg, pubKeys, roundOnePublicOutputs, invalidOutputs)[2]).toBe(false);
        }
        // contains duplicates
        {
            const invalidOutputs = [...roundTwoOutputs];
            invalidOutputs[1] = roundTwoOutputs[2];
            expect(api.schnorrMultisigCombineSignatures(msg, pubKeys, roundOnePublicOutputs, invalidOutputs)[2]).toBe(false);
        }
    });
    it('should not create combined key from public keys containing invalid key', () => {
        const pks = [...Array(5)].map(() => Fr.random());
        const pubKeys = pks.map(pk => api.schnorrMultisigCreateMultisigPublicKey(pk));
        // not a valid point
        {
            pubKeys[1] = new Buffer128(Buffer.alloc(128));
            expect(api.schnorrMultisigValidateAndCombineSignerPubkeys(pubKeys)[1]).toBe(false);
        }
        // contains duplicates
        {
            pubKeys[1] = pubKeys[2];
            expect(api.schnorrMultisigValidateAndCombineSignerPubkeys(pubKeys)[1]).toBe(false);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nobm9yci50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2JhcnJldGVuYmVyZ19hcGkvc2Nobm9yci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDbkMsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRW5FLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTdELFFBQVEsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQyxNQUFNLENBQUMsK0NBQStDLENBQUMsQ0FBQyxDQUFDO0lBQ25HLElBQUksR0FBd0IsQ0FBQztJQUU3QixTQUFTLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDbkIsR0FBRyxHQUFHLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQztRQUNyQyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDbEIsTUFBTSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQ3RCLElBQUksVUFBVSxDQUFDO1lBQ2IsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUs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