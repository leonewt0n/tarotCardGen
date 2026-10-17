# The Local Arcana

![demo video](https://github.com/leonewt0n/tarotCardGen/raw/refs/heads/main/demo.mov)

<img width="2638" height="2506" alt="image" src="https://github.com/user-attachments/assets/d477184e-e69e-46bc-a396-d3288ce5cdbe" />


A tarot table that never leaves the Mac. The browser shuffles a full 78-card deck. A chat model on [mlx-serve](https://mlxserve.com) reads the spread. An image model can paint each face. The shuffle, the meanings, and the last layout stay on this machine. Only the reading and the paintings travel, and they travel as far as `127.0.0.1`.

Printed faces and the deck’s own meanings still work when the server is off. The models are optional company, not a requirement to sit down.

## Sit down

You need Node.js and, when you want a voice or a painted face, [mlx-serve](https://mlxserve.com) with a chat model loaded.

```bash
npm install
npm run dev
```

Open the address Vite prints. In development, the default server `http://127.0.0.1:11234` is proxied through the app, so the browser never has to talk to that port directly.

In another terminal:

```bash
# Requires at least 12GB of VRAM/Unified RAM
mlx-serve pull ddalcu/Qwen-Image-2.1-Turbo-MLX-Serve-4bit
mlx-serve pull LiquidAI/LFM2.5-2.6B
mlx-serve serve
```

Leave the API key empty. mlx-serve trusts requests from this machine. The status pill turns to **mlx-serve online** once `GET /v1/models` answers. Pick a reader from the models it lists. Painting stays on **Printed faces** until an image model is installed.

## Two ways to use the table

**Reading** draws from the deck already in the app.

Ask a question, or tap a spark such as “What wants to begin?”. Choose a spread:

| Spread | Cards | What they hold |
| --- | --- | --- |
| One card | 1 | A single signal |
| Three cards | 3 | Past, present, future |
| Crossroads | 5 | The heart, what crosses you, what is above, what is beneath, the road ahead |

The deck is shuffled in the browser. About three in ten cards land reversed. Each card carries its own upright and reversed meaning, so a reading exists before any model speaks.

Turn on **Ask the reader** and a local chat model writes to the question in front of it: an overview, a note for each card, and one piece of guidance for the week. It does not invent cards that were not drawn, and it does not claim to know the future. Three voices change the temperature and the tone: Grounded, Lyrical, and Wild.

**Forge** asks the chat model to invent cards that are not renamed classics.

One card, or three in a sequence: what is here, what helps, what to watch. The model returns a title, suit, epithet, symbols, upright and reversed lines, and a scene. Those become cards on the felt.

**Paint the faces** sends each card, one at a time, to an image model. The prompt is the card’s scene, its upright or reversed mood, and a faint echo of the question. No letters, no numbers, no watermark. Faces are portrait, 512×768. Paint steps run from 4 to 50; the default is 9. FLUX.2 and Krea-2 are the painters mlx-serve is set up for. If a painting fails, the printed face remains.

**Read again** and **Paint again** redo those steps without reshuffling. **Stop** aborts the request in flight. **Clear** lifts the cards off the table.

The last spread is kept in the browser, without the painted images, so a refresh brings the layout and the reading back and leaves the faces to be painted again.

## What the server is asked

Everything goes to one OpenAI-compatible base URL.

| Call | Used for |
| --- | --- |
| `GET /v1/models` | Listing readers and painters |
| `POST /v1/chat/completions` | A streamed reading, or a forged card as JSON |
| `POST /v1/images/generations` | One portrait at a time, with `size` and `steps` |

Chat models are anything the catalog marks as chat. Image models are anything marked as image, or whose name looks like FLUX, Krea, or another diffusion model. Embedding models are left off both menus.

Point **Server** somewhere else if mlx-serve is not on port 11234. A key is sent as a bearer token only when you type one.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server, with the local mlx-serve proxy |
| `npm run build` | Typecheck, then production build |
| `npm run preview` | Serve the build, with the same proxy |
| `npm run lint` | oxlint |

The app is React 19 and TypeScript on Vite. There is no component library. The deck, the spreads, and the prompts live under `src/data` and `src/lib`. The table itself is `src/hooks/useArcana.ts`.
