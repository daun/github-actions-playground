import path from 'path'
import { fileURLToPath } from 'url'
import { parseReport, renderReportSummary, readFile } from './index.js'

const dir = path.dirname(fileURLToPath(import.meta.url))

async function test() {
	const data = await readFile(path.resolve(dir, 'fixtures/report.json'))
	// console.log(data)
	const report = parseReport(data)
	// console.log(report)
	const summary = renderReportSummary(report, { title: 'Playwright test results', iconStyle: 'octicons' })
	console.log(summary)
}

test()
