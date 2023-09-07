import fs from 'fs/promises'
import { getInput, setOutput, setFailed, startGroup, endGroup, debug } from '@actions/core'
import { context, getOctokit } from '@actions/github'

const iconSize = 14
const icons = {
	octicons: {
		failed: 'stop',
		passed: 'check-circle',
		flaky: 'alert',
		skipped: 'skip',
		duration: 'clock'
	},
	emojis: {
		failed: '❌',
		passed: '✅',
		flaky: '⚠️',
		skipped: '⏭️',
		duration: '⏱️'
	}
}

const colors = {
	failed: 'da3633',
	passed: '3fb950',
	flaky: 'd29922',
	skipped: 'abb4bf',
	secondary: 'abb4bf'
}

(async () => {
	try {
		const token = getInput('github-token')
		const octokit = getOctokit(token)
		await run(octokit, context, token);
	} catch (error) {
		setFailed(error.message)
	}
})()

async function run(octokit, context, token) {
	const cwd = process.cwd()

	const reportFile = getInput('report-file')
	const commenTitle = getInput('comment-title')
	const iconStyle = getInput('icon-style')

	const { eventName } = context
	const { owner, repo, number: pull_number } = context.issue

	try {
		debug('pull request ' + JSON.stringify(context.payload, null, 2))
	} catch (e) {}

	let baseRef
	let baseSha
	if (eventName == 'push') {
		baseRef = context.payload.ref
		baseSha = context.payload.before
		console.log(`Commit pushed onto ${baseRef} (${baseSha})`)
	} else if (eventName == 'pull_request' || eventName == 'pull_request_target') {
		baseRef = context.payload.pull_request.base.ref
		baseSha = context.payload.pull_request.base.sha
		console.log(`PR #${pull_number} targeting ${baseRef} (${baseSha})`)
	} else {
		throw new Error(`Unsupported event type: ${eventName}. Only "pull_request", "pull_request_target", and "push" triggered workflows are currently supported.`)
	}

	const reportPath = path.resolve(cwd, reportFile)
	const reportExists = await fileExists(reportPath)
	if (!reportExists) {
		debug(`Failed to find report file at path ${reportPath}`)
		throw new Error(`Report file ${reportFile} not found. Make sure Playwright is configured to generate a JSON report.`)
	}

	const report = JSON.parse(await readFile(reportPath))

	let commentId = null
	setOutput('comment-id', commentId)
}

function parseReport(report) {
	if (!report?.config?.metadata || !report?.suites) {
		debug('Invalid report file', JSON.stringify(report, null, 2))
		throw new Error('Invalid report file')
	}

	const version = report.config.version
	const duration = report.config.metadata.totalTime || 0
	const workers = report.config.metadata.actualWorkers || report.config.workers || 1
	const projects = report.config.projects.length
	const shards = report.config.shard.total
	const suites = report.suites.flatMap((total, suite) => {
		const suites = total + suite.suites.length
	}, [])
	const tests = report.suites.reduce((total, suite) => {
		const specs = suite
		const suites = total + suite.suites.length
	}, 0)

	return {
		version,
		duration,
		workers,
		projects,
		shards,
		suites,
		tests
	}
}

function renderTitle() {
	return `### ${title}`
}

function renderIcon(status) {
	if (iconStyle === 'octicons') {
		return createOcticonUrl(icons.octicons[status], { label: status, color: colors[status] })
	} else {
		return icons.emojis[status] || ''
	}
}

function createOcticonUrl(icon, { label = 'icon', color = '000000', size = iconSize } = {}) {
	if (icon) {
		return `![${label}](https://icongr.am/octicons/${icon}.svg?size=${size}&color=${color})`
	} else {
		return ''
	}
}

function renderMarkdownTable(rows, headers = null) {
	if (!rows.length) {
		return ''
	}
	const align = [':---', ':---:', ':---:', ':---:'].slice(0, rows[0].length)
	const lines = [headers, align, ...rows].filter(Boolean)
	return lines.map(columns => `| ${columns.join(' | ')} |`).join('\n')
}

async function fileExists(filename) {
	try {
		await fs.access(filename, fs.constants.F_OK)
		return true
	} catch (e) {
		return false
	}
}

async function readFile(path) {
	return await fs.readFile(path, { encoding: 'utf8' })
}

function toBool(v) {
	return /^(1|true|yes)$/.test(v)
}
