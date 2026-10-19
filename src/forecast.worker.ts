// Runs the Forecast off the main thread so the table paints while it simulates.
import { forecast } from './forecast.ts'

onmessage = (e: MessageEvent<Parameters<typeof forecast>[0]>) => postMessage(forecast(e.data))
