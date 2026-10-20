// Runs one share of the Forecast's simulations off the main thread, so the table paints while it simulates.
import { tally, type Input } from './forecast.ts'

onmessage = (e: MessageEvent<{ input: Input; from: number; to: number }>) => postMessage(tally(e.data.input, e.data.from, e.data.to))
