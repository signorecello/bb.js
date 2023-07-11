import { Crs } from '../crs/index.js';
import createDebug from 'debug';
import { newBarretenbergApiAsync } from '../factory/index.js';
import { RawBuffer } from '../types/index.js';
createDebug.enable('*');
const debug = createDebug('simple_test');
async function main() {
    const CIRCUIT_SIZE = 2 ** 19;
    debug('starting test...');
    const api = await newBarretenbergApiAsync();
    // Important to init slab allocator as first thing, to ensure maximum memory efficiency.
    await api.commonInitSlabAllocator(CIRCUIT_SIZE);
    // Plus 1 needed!
    const crs = await Crs.new(CIRCUIT_SIZE + 1);
    await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    const iterations = 10;
    let totalTime = 0;
    for (let i = 0; i < iterations; ++i) {
        const start = new Date().getTime();
        debug(`iteration ${i} starting...`);
        await api.examplesSimpleCreateAndVerifyProof();
        totalTime += new Date().getTime() - start;
    }
    await api.destroy();
    debug(`avg iteration time: ${totalTime / iterations}ms`);
    debug('test complete.');
}
void main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLnJhd3Rlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZXhhbXBsZXMvc2ltcGxlLnJhd3Rlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RDLE9BQU8sV0FBVyxNQUFNLE9BQU8sQ0FBQztBQUNoQyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFOUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN4QixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUM7QUFFekMsS0FBSyxVQUFVLElBQUk7SUFDakIsTUFBTSxZQUFZLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUU3QixLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUMxQixNQUFNLEdBQUcsR0FBRyxNQUFNLHVCQUF1QixFQUFFLENBQUM7SUFFNUMsd0ZBQXdGO0lBQ3hGLE1BQU0sR0FBRyxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxDQUFDO0lBRWhELGlCQUFpQjtJQUNqQixNQUFNLEdBQUcsR0FBRyxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFcEcsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDO0lBQ3RCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1FBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNwQyxNQUFNLEdBQUcsQ0FBQyxrQ0FBa0MsRUFBRSxDQUFDO1FBQy9DLFNBQVMsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLEtBQUssQ0FBQztLQUMzQztJQUVELE1BQU0sR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBRXBCLEtBQUssQ0FBQyx1QkFBdUIsU0FBUyxHQUFHLFVBQVUsSUFBSSxDQUFDLENBQUM7SUFDekQsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUVELEtBQUssSUFBSSxFQUFFLENBQUMifQ==