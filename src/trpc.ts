import { CreateTRPCClientOptions, Operation, TRPCClientRuntime, TRPCLink, createTRPCProxyClient } from '@trpc/client';
import { AnyRouter, DataTransformer, inferRouterContext } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { MessagePort, Worker } from 'worker_threads'



export class TypedChannel<TRouter extends AnyRouter> {
    public TRouter: TRouter;
    protected pending = new Map<number, {
        resolve: (data: string) => any,
        reject: (error: any) => any,
        runtime: TRPCClientRuntime,
    }>();

    /** Post a message to the channel */
    post(runtime: TRPCClientRuntime, op: Operation<any>) {
        throw new Error('Not Implemented');
    }

    /** Post a message and await its reply */
    exec(runtime: TRPCClientRuntime, op: Operation<any>) {
        return new Promise((resolve, reject) => {
            this.pending.set(op.id, { resolve, reject, runtime });
            this.post(runtime, op);
        });
    }

    handleRequests(opts: TIPCHandlerOptions<any>) {
        throw new Error('Not Implemented');
    }
}


export class MessagePortChannel<TRouter extends AnyRouter> extends TypedChannel<TRouter> {
    constructor(public messagePort: MessagePort | null) {
        super();
        this.subscribe();
    }

    protected constants() {
        const PREFIX = '::trpc::';
        const RESULT = PREFIX + 'result::';
        const CALL = PREFIX + 'call::';
        return {
            PREFIX,
            RESULT,
            CALL,
        }
    }

    protected subscribe() {
        if (!this.messagePort) return;
        const { RESULT } = this.constants();
        const callback = (msg: any) => {
            if (typeof msg === 'string' && msg.startsWith(RESULT)) {
                const _msg = msg.slice(RESULT.length);
                const _sep = _msg.indexOf(':');
                const id = Number(_msg.slice(0, _sep));
                if (this.pending.has(id)) {
                    const { runtime, resolve, reject } = this.pending.get(id)!;
                    this.pending.delete(id);
                    const data = runtime.transformer.deserialize(JSON.parse(_msg.slice(_sep + 1)));
                    if ('error' in data) {
                        // TODO: do trpc error formatting
                        reject(data['error'])
                    } else {
                        resolve(data);
                    }
                }
            }
        }
        this.messagePort.on('message', callback)
        return () => this.messagePort?.off('message', callback);
    }

    handleRequests({ router, transformer, context }: TIPCHandlerOptions<any>) {
        const { CALL, RESULT } = this.constants();
        this.messagePort!.on('message', (msg: string) => {
            if (typeof msg === 'string' && msg.startsWith(CALL)) {
                const op: Operation<unknown> = transformer.deserialize(JSON.parse(msg.slice(CALL.length)))
                // console.log('got call', op)
                const rop = {
                    id: op.id,
                }
                router.createCaller(context || op.context)[op.type](op.path, op.input)
                    .then(result => {
                        this.messagePort!.postMessage(RESULT + `${op.id}:` + JSON.stringify(transformer.serialize({ ...rop, result })))
                    })
                    .catch(error => {
                        this.messagePort!.postMessage(RESULT + `${op.id}:` + JSON.stringify(transformer.serialize({ ...rop, error })))
                    })
            }
        })
    }

    post(runtime: TRPCClientRuntime, op: Operation<any>) {
        const { CALL } = this.constants();
        // console.log('post da msg', op)
        this.messagePort?.postMessage(CALL + JSON.stringify(runtime.transformer.serialize(op)))
    }

}

export class WorkerChannel<TRouter extends AnyRouter> extends MessagePortChannel<TRouter> {
    constructor(public worker: Worker) {
        super(worker as any);
    }
}


type ChannelLinkOptions = {
    channel: TypedChannel<any>
}

function channelLink<TRouter extends AnyRouter>(
    opts: ChannelLinkOptions
): TRPCLink<TRouter> {
    return (runtime) => {
        return ({ next, op }) => {
            return observable((observer) => {

                opts.channel.exec(runtime, op)
                    .then(o => {
                        observer.next({
                            context: op.context,
                            result: {
                                type: 'data',
                                data: o!['result']
                            }
                        })
                        observer.complete();
                    })
                    .catch(err => {
                        // TODO: do proper error handling
                        observer.error(err);
                    })

                return () => {
                    // console.log('cancel');
                }

            })
        }
    }
}



type TIPCClientOptions<TRouter extends AnyRouter> = Omit<CreateTRPCClientOptions<TRouter>, 'links'> & {
    channel: TypedChannel<TRouter>,
}

export function createTIPCProxyClient<TOptions extends TIPCClientOptions<TRouter>, TRouter extends AnyRouter>(opts: TOptions & TIPCClientOptions<TRouter>) {
    return createTRPCProxyClient<TRouter>({
        transformer: opts.transformer as any,
        links: [
            channelLink({
                channel: opts.channel
            })
        ]
    })
}

type TIPCHandlerOptions<TRouter extends AnyRouter> = Omit<CreateTRPCClientOptions<TRouter>, 'links'> & {
    channel: TypedChannel<TRouter | any>,
    router: TRouter | any,
    context?: inferRouterContext<TRouter>,
}

export function registerTIPCHandler<TRouter extends AnyRouter>(opts: TIPCHandlerOptions<TRouter>) {
    opts.channel.handleRequests(opts);
}


