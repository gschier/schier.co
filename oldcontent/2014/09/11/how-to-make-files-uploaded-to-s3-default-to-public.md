---
title: "How to Make Files Uploaded to S3 Default to Public"
slug: "how-to-make-files-uploaded-to-s3-default-to-public"
date: "2014-09-11"
url: "blog/2014/09/11/how-to-make-files-uploaded-to-s3-default-to-public.html"
tags: ["tutorial", "aws", "devops"]
---

By default, files uploaded to Amazon S3 are private, requiring a separate action to make public. To make uploads default to public, add this policy to your S3 bucket.

```json
{
  "Version": "2008-10-17",
  "Statement": [{
    "Sid": "AllowPublicRead",
    "Effect": "Allow",
    "Principal": {
      "AWS": "*"
    },
    "Action": [ "s3:GetObject" ],
    "Resource": [ "arn:aws:s3:::MY_BUCKET_NAME/*" ]
  }]
}
```

If you aren't sure how to add a policy, follow these steps:

1. click on bucket
2. expand the Permissions row
3. click "Add Bucket Policy"
4. copy/paste the snippet below into the text area.
5. change `MY_BUCKET_NAME` to the bucket you want
6. submit your changes

That's it!


