import { Worker, workerData, isMainThread, parentPort } from 'worker_threads';

// import './trpc';

if (isMainThread) {
    require('./main');
} else {
    console.log('new worker', { workerData })
    parentPort?.postMessage('yeyeyeeeee');
    require('./worker');
}

