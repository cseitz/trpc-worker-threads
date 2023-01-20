import { WorkerChannel, createTIPCProxyClient, registerTIPCHandler } from './trpc';
import { initTRPC } from '@trpc/server'
import { Worker } from 'worker_threads';
import { WorkerRouter } from './worker';
import SuperJSON from 'superjson'


const t = initTRPC.context<{
    worker?: string
}>().create({
    transformer: SuperJSON,
})

export type MainRouter = typeof mainRouter;
export const mainRouter = t.router({
    ping: t.procedure
        .query(({ ctx }) => {
            // console.log('oof')
            console.log('main.ping', { ctx })
            return {
                date: new Date(),
                on: 'main thread'
            }
        }),
    woah: t.router({
        nested: t.router({
            yee: t.procedure.query(() => ({}))
        })
    })
})


function spawnWorker() {
    const worker = new Worker(__dirname + '/worker.ts');
    const channel = new WorkerChannel<WorkerRouter>(worker);

    // Listen for calls to the main thread
    registerTIPCHandler({
        transformer: SuperJSON,
        router: mainRouter,
        channel,
    })

    // Allow us to call procedures on the worker
    const client = createTIPCProxyClient({
        transformer: SuperJSON,
        channel,
    })

    return Object.assign(worker, {
        ipc: client,
    })
}


// Create a worker
const worker = spawnWorker();

// Ping it twice
worker.ipc.ping.query().then(o => console.log(o));
worker.ipc.ping.query().then(o => console.log(o));

// Instruct the worker to kill itself
setTimeout(() => {
    console.log('exiting');
    worker.ipc.exit.mutate();
}, 2000)

