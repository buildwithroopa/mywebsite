# Roopa Iyer — Portfolio & Daily AI Gazette

A personal portfolio and printable resume, with a sourced, humorous daily newspaper covering AI news, learning concepts, and practical priorities.

## Live site

- Portfolio: [roopaiyer.net](https://roopaiyer.net/)
- Daily AI Gazette: [roopaiyer.net/ainews](https://roopaiyer.net/ainews)

## Preview

Visit the [portfolio homepage](https://roopaiyer.net/) or open the [AI Gazette edition](https://roopaiyer.net/ainews) to see the live site.

## Overview

The site presents Roopa Iyer’s engineering leadership experience, approach, projects, mentoring, and volunteering. The AI Gazette extends the portfolio with a daily, newspaper-style brief: important AI developments, one concept to learn, and a short list of things to do, watch, or ignore. Headlines can be playful; reporting stays sourced and careful about uncertainty.

## Tech stack

- Astro 5
- JavaScript, HTML, and CSS
- Google Fonts (DM Sans, Manrope, DM Mono)
- Vercel hosting and Git-based production deployments
- GitHub Actions for the scheduled edition workflow
- OpenAI Responses API with hosted web search for research and edition generation

## Features

- Responsive portfolio and experience timeline
- Printable resume
- Daily AI Gazette with linked sources, research/news labels, a learning concept, and a focus list
- Daily issue generation workflow with source validation
- Manual workflow dispatch for publishing an edition
- Reduced-motion and keyboard-focus support

## Getting started

Requirements: Node.js 24 (or a compatible current Node.js release) and npm.

```bash
git clone https://github.com/buildwithroopa/mywebsite.git
cd mywebsite
npm install
npm run dev
```

Astro prints the local development URL in the terminal. Create and preview a production build with:

```bash
npm run build
npm run preview
```

## Daily AI Gazette setup

The GitHub Actions workflow runs daily at 15:15 UTC (7:15 AM Pacific Standard Time / 8:15 AM Pacific Daylight Time). It writes the new edition data to `src/data/ainews-latest.json`; the existing GitHub-to-Vercel integration deploys the update.

To enable generation, add an OpenAI API key to the repository as an Actions secret named `OPENAI_API_KEY`:

1. Open **Settings → Secrets and variables → Actions**.
2. Select **New repository secret**.
3. Set the name to `OPENAI_API_KEY`, paste the key as its value, and save.
4. Run **Actions → Publish Daily AI Gazette → Run workflow** to publish the first refreshed issue.

No Vercel environment variable is needed. Keep the API key in GitHub Secrets; never commit it or expose it in browser code.

## Repository layout

```text
src/
  data/ainews-latest.json     Current Gazette issue
  pages/
    index.astro               Portfolio homepage
    ainews.astro              Daily AI Gazette
scripts/
  generate-ainews.mjs         Research, validate, and write the daily issue
.github/
  workflows/ainews.yml        Scheduled and manual publishing workflow
```

## Author

**Roopa Iyer** · [LinkedIn](https://www.linkedin.com/in/roopaiyer/) · [Email](mailto:riyer.job@gmail.com)

## License

No license file is currently included. All rights are reserved unless a license is added to this repository.
