---
title: "Self Code Review"
slug: "self-code-review"
date: "2012-12-23"
url: "blog/2012/12/23/self-code-review.html"
---

When first exposed to working on a development team in the "real world", I had the privilege of experiencing code review. Code review can be good for getting criticism about one's code, but I found it especially beneficial to gain the skill of critiquing code of a much higher quality than mine. This greatly improved the quality of my own code in a very short time.

Today I work on projects mostly by myself, so I don't have anyone around to review my code. This means that the code I produce is never criticised, which leads to sub par work (BUGS!). A week ago I decided to try reviewing my own code to hopefully gain some of the benefits that peer code review provides. This seemed like a strange idea at first, but surprisingly it has already made a big difference. I find myself catching stupid things like stray console logs, or realizing that some part of logic could be refactored or modularized. It still feels slightly weird approving my own pull requests, but it shouldn't take long to get used to that. Here is my current workflow:

1. Create a new development branch in Git
2. Hack
3. Commit changes
4. Push branch to Bitbucket
5. Create a pull request for said branch
6. Look over diffs and try to find at least one thing that needs improvement
7. Hack
8. Check once more and go back to 7 if necessary
9. Merge pull request

This workflow is working fairly well so far, but I need a better way to ensure that no implementation details are missing from a particular feature. This could obviously be done with any checklist application, but something that is tied closer to the pull request would be better. I may try doing this by listing all work items in the pull request description and making sure they are all complete during review.

All in all, my loner development process is getting better. I still think peer code review is much better than self review, but self review is better than none at all and forces you to think about what you're doing and why you're doing it.


