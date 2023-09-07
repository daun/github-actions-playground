import path from 'path'
import { fileURLToPath } from 'url'
import { parseReport, renderReportSummary, readFile } from './index.js'

const dir = path.dirname(fileURLToPath(import.meta.url))

async function test() {
	const data = await readFile(path.resolve(dir, 'fixtures/report.json'))
	// console.log(data)
	const report = parseReport(data)
	// console.log(report)
	const summary = renderReportSummary(report, {
		commit: '999003bc19c94ba5e916a3ac5c9598dd54bed36c',
		message: 'feat: add new feature',
		title: 'Playwright test results',
		reportUrl: 'http://report.url/report/',
		iconStyle: 'octicons'
	})
	console.log(summary)
}

test()
