
## tRPC Worker Threads

Provides TypeSafe IPC for Node.js's Worker Threads via their MessagePort.


```ts
// main.ts
import { WorkerChannel, createTIPCProxyClient, registerTIPCHandler } from './trpc';
import { initTRPC } from '@trpc/server'
import { Worker } from 'worker_threads';
import { WorkerRouter } from './worker';
import SuperJSON from 'superjson'


const t = initTRPC.context<{
    worker?: Worker
}>().create({
    transformer: SuperJSON,
})

export type MainRouter = typeof mainRouter;
export const mainRouter = t.router({
    ping: t.procedure
        .query(({ ctx }) => {
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
    registerTIPCHandler<MainRouter>({
        transformer: SuperJSON,
        router: mainRouter,
        channel,
        context: {
            worker,
        }
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
    worker.ipc.exit.mutate();
}, 2000)


```


```ts
// worker.ts
import { MessagePortChannel, createTIPCProxyClient, registerTIPCHandler } from './trpc';
import { parentPort } from 'worker_threads';
import { initTRPC } from '@trpc/server';
import { MainRouter } from './main';
import SuperJSON from 'superjson';


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


const channel = new MessagePortChannel<MainRouter>(parentPort);

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

// Keep the worker running (unless we forcefully exit)
setInterval(() => {}, 1000);


```