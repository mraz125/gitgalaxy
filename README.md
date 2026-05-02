# GitGalaxy

GitGalaxy is a static explorer for AI-related GitHub repositories.

## What it does

- maps repositories as connected nodes
- scales node size by GitHub stars
- supports searching by `owner/repo` or full GitHub URL
- highlights related repositories around a selected repo
- refreshes public repository metadata daily

## Inclusion policy

### Default inclusion

- public repositories only
- AI-related repositories
- `stars >= 500`
- archived repositories excluded
- forks excluded by default

### Exception inclusion

Repositories below the default star threshold may still be included after local review when they are:

- rapidly growing
- category-defining
- technically influential
- necessary to fill a sparse category

Exception entries are maintained in `data/manual-includes.json`.

## Categories

- LLM
- Agents
- RAG
- Inference
- Fine-tuning
- Evaluation
- AI Apps
- Multimodal

## Data update

### Daily automated update

GitHub Actions updates the public dataset every day at:

- `09:00 KST`
- `00:00 UTC`

### Weekly local review

A local weekly review can adjust manual includes, category assignments, and relation quality. Only reviewed results should be committed.

## Development

```bash
npm install
npm run update-data
npm run dev
```

## Manual review helper

Generate a local review report:

```bash
npm run review-report
```

The report is written under `local/` and is ignored by git.
