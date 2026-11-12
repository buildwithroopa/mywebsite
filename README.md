# Roopa Iyer Portfolio

Astro portfolio and printable resume for Roopa Iyer.

## Run locally

```sh
pnpm install
pnpm dev
```

Create the production site with `pnpm build`. The `dist/` directory contains the static site. The resume page can be printed or saved as PDF from a browser.

## Resume

Open the home page and select **Print / save as PDF** to export the portfolio as a resume.

## Daily AI Gazette

Open `/ainews` for the Daily AI Gazette. A GitHub Actions workflow refreshes the edition every day at 15:15 UTC (7:15 AM PST / 8:15 AM PDT) and the normal Vercel Git integration publishes the site after the edition commit.

To enable daily research, add an OpenAI API key to the GitHub repository as an Actions secret named `OPENAI_API_KEY` in **Settings → Secrets and variables → Actions**. The generator uses the Responses API with hosted web search and stores only the generated issue JSON in the repository. No Vercel environment variable is required. The workflow can also be started manually from **Actions → Publish Daily AI Gazette → Run workflow**.
