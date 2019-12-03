---
title: "How to Replicate a MongoDB Database from Remote to Local"
slug: "how-to-replicate-a-mongodb-database-from-remote-to-local"
date: "2013-09-30"
url: "blog/2013/09/30/how-to-replicate-a-mongodb-database-from-remote-to-local.html"
tags: ["tutorial", "devops", "database"]
---

Here is a simple script to backup a MongoDB remote database and restore it locally.

```bash
#!/bin/bash

HOST="myhost.com"
PORT="1337"
REMOTE_DB="myremote"
LOCAL_DB="mylocal"
USER="giraffe"
PASS="7hIs15MyPa5s"

## DUMP THE REMOTE DB
echo "Dumping '$HOST:$PORT/$REMOTE_DB'..."
mongodump --host $HOST:$PORT --db $REMOTE_DB -u $USER -p $PASS

## RESTORE DUMP DIRECTORY
echo "Restoring to '$LOCAL_DB'..."
mongorestore --db $LOCAL_DB --drop dump/$REMOTE_DB

## REMOVE DUMP FILES
echo "Removing dump files..."
rm -r dump

echo "Done."

```

And that's it. Dumping and restoring MongoDB databases really is that easy. If you have any questions leave them in the comments below and I'll get back to you as soon as possible.





