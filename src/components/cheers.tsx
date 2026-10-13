// The cheers button under a post and the messages it brings up as a reader
// keeps pressing it (templates/partials/blog_post.html and its voting
// script): each press is sent to /api/blog/vote, a reader's presses are
// kept in localStorage (vote-{slug}), and fifty is the most one reader can
// give.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '#/components/site'
import type { PostView } from '#/lib/views'

type Message = { votes: number; effect?: 'page-flip' | 'page-shake' | 'shake' }

/// The messages, most cheers first, as the Go template listed them.
const MESSAGES: Message[] = [{ votes: 50, effect: 'page-flip' }, { votes: 39, effect: 'page-shake' }, { votes: 25, effect: 'shake' }, { votes: 13 }, { votes: 3 }, { votes: 1 }]

const MAX = 50

function stored(key: string): number {
  try {
    const n = parseInt(localStorage.getItem(key) ?? '')
    return isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

export function Cheers({ post, children }: { post: PostView; children: ReactNode }) {
  const key = `vote-${post.slug}`
  const [total, setTotal] = useState<string>(post.votesTotal ? String(post.votesTotal) : 'Be the first to')
  const [maxed, setMaxed] = useState(false)
  // Shown messages, newest first, as the script prepended them.
  const [shown, setShown] = useState<number[]>([])
  const button = useRef<HTMLDivElement>(null)

  useEffect(() => setMaxed(stored(key) >= MAX), [key])

  async function cheer(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const count = stored(key)
    const response = await fetch('/api/blog/vote', {
      method: 'POST',
      body: `slug=${encodeURIComponent(post.slug)}&count=${count}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const text = await response.text()
    try {
      localStorage.setItem(key, JSON.stringify(count + 1))
    } catch {
      // Private windows may have no storage; the cheer still counts.
    }
    setMaxed(count + 1 >= MAX)
    setTotal(text)
    let next = shown
    for (const message of MESSAGES) {
      if (count + 1 < message.votes || next.includes(message.votes)) continue
      next = [message.votes, ...next]
      const container = button.current
      if (message.effect === 'shake' && container) {
        container.style.animation = 'shake 0.5s'
        container.style.animationIterationCount = 'infinite'
      }
      if (message.effect === 'page-shake') {
        document.body.style.animation = 'shake 0.6s'
        document.body.style.animationIterationCount = 'infinite'
        if (container) container.style.animation = ''
      }
      if (message.effect === 'page-flip') {
        document.body.style.animation = 'flip 0.3s'
        document.body.style.animationFillMode = 'forwards'
        if (container) container.style.animation = ''
      }
    }
    setShown(next)
  }

  return (
    <>
      <div className="row-spaced">
        <div className="clap-button" ref={button}>
          <button title="Cheers this post" disabled={!post.published || maxed} onClick={cheer}>
            <Icon name="cheers" />
          </button>
          <div title={`${post.votesUsers} readers`}>
            <span className="clap-count">{total}</span> cheers
          </div>
        </div>
        {children}
      </div>
      <div className="vote-messages">
        {shown.map((votes) => (
          <div key={votes} data-votes={votes} style={{ animation: 'fade-in 0.5s' }}>
            <MessageBody votes={votes} slug={post.slug} />
          </div>
        ))}
      </div>
    </>
  )
}

function MessageBody({ votes, slug }: { votes: number; slug: string }) {
  switch (votes) {
    case 50:
      return <div className="notice notice--danger">Now look what you've done 🌋</div>
    case 39:
      return <div className="notice notice--danger notice--huge">Stop clicking and run for your life! 😱</div>
    case 25:
      return <div className="notice notice--warning notice--big">Uh oh, I don't think the system can't handle it! 🔥</div>
    case 13:
      return <div className="notice notice--warning">Stop it, you're too kind 😄</div>
    case 3:
      return <div className="notice notice--notice">Thanks for the love! ❤️</div>
  }
  const share = (platform: string) => `/blog/share/${slug}/${platform}`
  return (
    <div className="notice">
      Thanks, glad you enjoyed it! Care to share?
      <div className="blog-post__btns">
        <a href={share('hn')} target="_blank" rel="nofollow" className="btn btn--xs svg-icon btn--hn">
          <Icon name="hn" /> Hacker News
        </a>
        <a href={share('twitter')} target="_blank" rel="nofollow" className="btn btn--xs svg-icon btn--twitter">
          <Icon name="twitter" /> Twitter
        </a>
        <a href={share('reddit')} target="_blank" rel="nofollow" className="btn btn--xs svg-icon btn--reddit">
          <Icon name="reddit" /> Reddit
        </a>
        <a href={share('email')} target="_blank" rel="nofollow" className="btn btn--xs svg-icon btn--email">
          <Icon name="email" /> Email
        </a>
      </div>
    </div>
  )
}
