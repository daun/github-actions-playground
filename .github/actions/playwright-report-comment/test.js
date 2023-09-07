import path from 'path'
import { fileURLToPath } from 'url'
import { parseReport, readFile } from './index.js'

const dir = path.dirname(fileURLToPath(import.meta.url))

async function test() {
	const data = await readFile(path.resolve(dir, 'fixtures/report.json'))
	console.log(data)
	const report = parseReport(data)
	console.log(report)
}

test()
