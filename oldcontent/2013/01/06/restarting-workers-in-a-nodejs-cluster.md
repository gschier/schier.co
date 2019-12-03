---
title: "Restarting Workers in a Nodejs Cluster"
slug: "restarting-workers-in-a-nodejs-cluster"
date: "2013-01-06"
url: "blog/2013/01/06/restarting-workers-in-a-nodejs-cluster.html"
tags: ["tutorial", "nodejs"]
---

We upgraded ForkJoy to Node.js v0.8 and decided to use the newly rewritten  [Cluster](https://nodejs.org/api/cluster.html "Node.js Cluster Module") module. Cluster allows a *parent* Node process to manage multiple *worker* processes on a single port to better take advantage of multi-core machines.

Before this change, Forkjoy was using [Forever](https://github.com/nodejitsu/forever "Node.js Forever Module") to restart the main process if it died. When using Cluster, Forever does not know about the worker processes (only the parent process) and therefore will not restart workers if they fail. Eventually all the workers die off leaving nothing to handle server requests. This is bad!

Luckily, starting a new process when one dies only takes a few lines of code. This is the snippet we're currently using.

```javascript
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  // Fork workers. One per CPU for maximum effectiveness
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(deadWorker, code, signal) {
    // Restart the worker
    var worker = cluster.fork();

    // Note the process IDs
    var newPID = worker.process.pid;
    var oldPID = deadWorker.process.pid;

    // Log the event
    console.log('worker '+oldPID+' died.');
    console.log('worker '+newPID+' born.');
  });
} else {
  // All the regular app code goes here
}
```

That's all there is to it.


