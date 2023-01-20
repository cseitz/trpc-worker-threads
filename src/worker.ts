import { initTRPC } from '@trpc/server';
import SuperJSON from 'superjson';
import { MessagePortChannel, createTIPCProxyClient, registerTIPCHandler } from './trpc';
import { MainRouter } from './main';
import { parentPort } from 'worker_threads';

const t = initTRPC.context<{
    from: string
}>().create({
    transformer: SuperJSON,
})

let counter = 0;

export type WorkerRouter = typeof workerRouter;
export const workerRouter = t.router({
    ping: t.procedure
        .query(async ({ ctx }) => {
            console.log('worker.ping', { ctx })
            await new Promise(r => setTimeout(r, 1000));
            return {
                date: new Date(),
                counter: ++counter,
            }
        }),
    doThing: t.procedure
        .mutation(() => {
            return 5;
        }),
    exit: t.procedure
        .mutation(() => {
            process.exit(0);
        })
})


const channel = new MessagePortChannel<MainRouter>(parentPort!);

// Listen for calls to this worker
registerTIPCHandler({
    transformer: SuperJSON,
    router: workerRouter,
    channel,
})

// Allow us to call procedures on the main thread
const main = createTIPCProxyClient({
    transformer: SuperJSON,
    channel,
})

// Ping the main thread
main.ping.query().then(o => console.log('yeee worker', o));

setInterval(() => {

}, 1000)

