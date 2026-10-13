// The Go site's SVGs (frontend/images, served at /static/images), which its
// templates inlined into the page; inlined here the same way.

import greg from '../../public/static/images/greg-rounded.svg?raw'
import cheers from '../../public/static/images/icons/cheers.svg?raw'
import email from '../../public/static/images/icons/email.svg?raw'
import hn from '../../public/static/images/icons/hn.svg?raw'
import link from '../../public/static/images/icons/link.svg?raw'
import moon from '../../public/static/images/icons/moon.svg?raw'
import reddit from '../../public/static/images/icons/reddit.svg?raw'
import rss from '../../public/static/images/icons/rss.svg?raw'
import search from '../../public/static/images/icons/search.svg?raw'
import sun from '../../public/static/images/icons/sun.svg?raw'
import twitter from '../../public/static/images/icons/twitter.svg?raw'

export const svgs = { greg, cheers, email, hn, link, moon, reddit, rss, search, sun, twitter }
export type IconName = keyof typeof svgs
