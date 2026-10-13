import { createFileRoute } from '@tanstack/react-router'
import { Site, pageHead } from '#/components/site'

// The books page (templates/pages/page/books.html), not linked from the
// navigation but still served.

export const Route = createFileRoute('/books')({
  head: (ctx) => pageHead({ title: 'Books' }, ctx),
  component: Books,
})

const TOP_TEN: [string, string][] = [
  ['https://www.amazon.ca/Shoe-Dog-Memoir-Creator-Nike/dp/1501135910', 'Shoe Dog (Phil Knight)'],
  ['https://www.amazon.ca/Chaos-Monkeys-Obscene-Fortune-Failure/dp/0062458191', 'Chaos Monkeys (Antonio García Martínez)'],
  ['https://www.amazon.ca/Anything-You-Want-Lessons-Entrepreneur/dp/1591848261', 'Anything You Want (Derek Sivers)'],
  ['https://www.amazon.ca/Made-Stick-Ideas-Survive-Others/dp/1400064287', 'Made to Stick (Chip and Dan Heath)'],
  ['https://www.amazon.ca/Steve-Jobs-Walter-Isaacson/dp/1451648537', 'Steve Jobs (Walter Isaacson)'],
  ['https://www.amazon.ca/Quiet-Power-Introverts-World-Talking/dp/0307352153', 'Quiet: The Power of Introverts (Susan Cain)'],
  ['https://www.amazon.ca/What-Talk-About-When-Running/dp/0385681917', 'What I Talk About When I Talk About Running (Haruki Murakami)'],
  ['https://www.amazon.ca/Power-Habit-What-Life-Business/dp/0385669763', 'The Power of Habit (Charles Duhigg)'],
  ['https://www.amazon.ca/Trigger-Point-Therapy-Workbook-Self-Treatment/dp/1572243759', 'The Trigger Point Therapy Workbook (Clair Davies)'],
  ['https://www.amazon.ca/Emperor-All-Maladies-Biography-Cancer/dp/1439170916', 'The Emperor of All Maladies (Siddhartha Mukherjee)'],
]

function Books() {
  return (
    <Site>
      <div className="container content">
        <h1>Books I've Read 📚</h1>
        <p>I hated reading for most of my life. I started reading in 2017 after a friend gave me the book Chaos Monkeys as a gift for mentoring his university students. </p>
        <p>To my surprise, I now love reading. I’m always looking for new books so, if you have any suggestions, please let me know! </p>
        <h2>Top 10</h2>
        <ol>
          {TOP_TEN.map(([href, title]) => (
            <li key={href}>
              <a href={href}>{title}</a>
            </li>
          ))}
        </ol>
      </div>
    </Site>
  )
}
