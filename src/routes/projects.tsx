import { createFileRoute } from '@tanstack/react-router'
import { Site, pageHead } from '#/components/site'

// The projects page (templates/pages/page/projects.html).

export const Route = createFileRoute('/projects')({
  head: (ctx) => pageHead({ title: 'Projects', description: "Projects I'm currently working on" }, ctx),
  component: Projects,
})

const icon = (name: string) => `/static/images/projects/${name}.png`

function Projects() {
  return (
    <Site>
      <div className="container content">
        <h1>Projects</h1>
        <p>I love building things. Here are some of the projects I currently maintain.</p>
        <div className="project">
          <h3>
            <a href="https://yaak.app">
              <img src={icon('yaak')} alt="Yaak" />
              Yaak API Client
            </a>
          </h3>
          <p>
            <strong>$0/month</strong>
          </p>
          <p>An app to interact with network APIs</p>
        </div>
        <div className="project">
          <h3>
            <a href="https://readrally.app">
              <img src={icon('readrally')} alt="Kabook!" />
              Kabook!
            </a>
          </h3>
          <p>
            <strong>$50/month</strong>
          </p>
          <p>An app to keep track of the books in your life</p>
        </div>
        <div className="project">
          <h3>
            <a href="https://codesalad.dev">
              <img src={icon('codesalad')} alt="Code Salad icon" />
              Code Salad
            </a>
          </h3>
          <p>
            <strong>$0/month</strong>
          </p>
          <p>A website for programming tutorials, projects, and tips!</p>
        </div>
        <div className="project">
          <h3>
            <a href="https://platformpixels.com">
              <img src={icon('platformpixels')} alt="Platform Pixels icon" />
              Platform Pixels
            </a>
          </h3>
          <p>
            <strong>$??/month</strong>
          </p>
          <p>A 2D cross-platform adventure game with high difficulty because games are too easy these days.</p>
        </div>
        <div className="project">
          <h3>
            <a href="https://play.google.com/store/apps/details?id=com.gregschier.toread">
              <img src={icon('toread')} alt="To Read icon" />
              To Read
            </a>
          </h3>
          <p>
            <strong>$100/month</strong> ads + IAP
          </p>
          <p>An Android app for tracking the books you want to read. Basically, a to-do list specific to books.</p>
        </div>
        <hr />
        <h2>Retired Projects 🏚</h2>
        <p>Some projects don't stand the test of time. Here are a few that I've had to shut down for various reasons.</p>
        <div className="project">
          <h3>
            <a href="https://insomnia.rest">
              <img src={icon('insomnia')} alt="Insomnia icon" />
              Insomnia
            </a>
          </h3>
          <p>
            <strong>
              <del>$20k/month</del>
            </strong>{' '}
            <a href="/blog/indie-to-acquisition">Acquired</a>! 🎉
          </p>
          <p>A cross-platform desktop app to help software developers interact with HTTP-based APIs.</p>
        </div>
        <div className="project">
          <h3>
            <a href="https://www.youtube.com/watch?v=vwnVEIfIfOU">
              <img src={icon('forkjoy')} alt="Forkjoy icon" />
              Forkjoy
            </a>
          </h3>
          <p>
            <strong>$0/month</strong>
          </p>
          <p>A mobile/web app to help people find the best food in the city. It contained full restaurant menus, prices, etc, and users could upload photos.</p>
          <small>Shut down because we ran out of funding and couldn’t generate revenue</small>
        </div>
        <div className="project">
          <h3>
            <span>
              <img src={icon('vicbus')} alt="Victoria Bus icon" />
              Victoria Bus
            </span>
          </h3>
          <p>
            <strong>$50/month</strong>
          </p>
          <p>An Android app for my hometown of Victoria to access public transit schedules, before Google Maps took over</p>
          <small>Shut down because Google Maps offered something way better</small>
        </div>
        <div className="project">
          <h3>
            <a href="https://www.youtube.com/watch?v=GH7L61jILYk">
              <img src={icon('plans4ramps')} alt="Plans4Ramps icon" />
              Plans4Ramps
            </a>
          </h3>
          <p>
            <strong>$40/month</strong> ads
          </p>
          <p>
            The first real website I made. I built many BMX ramps growing up made this site to teach others how to do the same. It had step-by-step instructions, materials lists, and 3D
            renders of each step.
          </p>
          <small>Shut down because I lost the code</small>
        </div>
      </div>
    </Site>
  )
}
