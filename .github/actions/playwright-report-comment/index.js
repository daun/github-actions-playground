import fs from 'fs/promises'
import path from 'path'
import { getInput, setOutput, setFailed, startGroup, endGroup, debug } from '@actions/core'
import { context, getOctokit } from '@actions/github'

const iconSize = 12
const icons = {
	octicons: {
		failed: 'stop',
		passed: 'check-circle',
		flaky: 'alert',
		skipped: 'skip',
		stats: 'pulse',
		duration: 'clock',
		link: 'link-external',
		report: 'package',
		commit: 'git-pull-request'
	},
	emojis: {
		failed: '❌',
		passed: '✅',
		flaky: '⚠️',
		skipped: '⏭️',
		stats: '',
		duration: '',
		link: '',
		report: '',
		commit: ''
	}
}

const colors = {
	failed: 'da3633',
	passed: '3fb950',
	flaky: 'd29922',
	skipped: '0967d9',
	icon: 'abb4bf',
}

async function run() {
	const cwd = process.cwd()
	const token = getInput('github-token')
	const octokit = getOctokit(token)

	const reportFile = getInput('report-file')
	const commentTitle = getInput('comment-title')
	const iconStyle = getInput('icon-style')

	const { eventName, repo, payload } = context
	const { owner, number: pull_number } = context.issue

	try {
		debug('pull request ' + JSON.stringify(payload, null, 2))
	} catch (e) {}

	const base = {}
	const head = {}
	if (eventName == 'push') {
		base.ref = payload.ref
		base.sha = payload.before
		head.ref = payload.ref
		head.sha = payload.after
		console.log(`Commit pushed onto ${base.ref} (${head.sha})`)
	} else if (eventName == 'pull_request' || eventName == 'pull_request_target') {
		base.ref = payload.pull_request.base.ref
		base.sha = payload.pull_request.base.sha
		head.ref = payload.pull_request.head.ref
		head.sha = payload.pull_request.head.sha
		console.log(`PR #${pull_number} targeting ${base.ref} (${head.sha})`)
	} else {
		throw new Error(`Unsupported event type: ${eventName}. Only "pull_request", "pull_request_target", and "push" triggered workflows are currently supported.`)
	}

	const reportPath = path.resolve(cwd, reportFile)
	const reportExists = await fileExists(reportPath)
	if (!reportExists) {
		debug(`Failed to find report file at path ${reportPath}`)
		throw new Error(`Report file ${reportFile} not found. Make sure Playwright is configured to generate a JSON report.`)
	}

	const data = await readFile(reportPath)
	const report = parseReport(data)
	const summary = renderReportSummary(report, { commit: head.sha, title: commentTitle, iconStyle })

	const prefix = '<!-- playwright-report-github-action -->'
	const body = `${prefix}\n\n${summary}`
	let commentId = null

	if (eventName !== 'pull_request' && eventName !== 'pull_request_target') {
		console.log('No PR associated with this action run. Not posting a check or comment.')
	} else {
		startGroup(`Commenting test report on PR`)
		try {
			const { data: comments } = await octokit.rest.issues.listComments({ ...repo, issue_number: pull_number })
			const existingComment = comments.findLast(c => c.user.type === 'Bot' && c.body.includes(prefix)) || {}
			commentId = existingComment.id || null
		} catch (error) {
			console.error(`Error fetching existing comments: ${error.message}`)
		}

		if (commentId) {
			console.log(`Found previous comment #${commentId}`)
			try {
				await octokit.rest.issues.updateComment({ ...repo, comment_id: commentId, body })
				console.log(`Updated previous comment #${commentId}`)
			} catch (error) {
				console.error(`Error updating previous comment: ${error.message}`)
				commentId = null
			}
		}

		if (!commentId) {
			console.log('Creating new comment')
			try {
				const { data: newComment } = await octokit.rest.issues.createComment({ ...repo, issue_number: pull_number, body })
				commentId = newComment.id
				console.log(`Created new comment #${commentId}`)
			} catch (error) {
				console.error(`Error creating comment: ${error.message}`)
				console.log(`Submitting PR review comment instead...`)
				try {
					const { issue } = context
					await octokit.rest.pulls.createReview({ owner, repo: issue.repo, pull_number: issue.number, event: 'COMMENT', body })
				} catch (e) {
					console.error(`Error creating PR review: ${error.message}`)
				}
			}
		}
		endGroup()
	}

	if (!commentId) {
		const intro = `Unable to comment on your PR — this can happen for PR's originating from a fork without write permissions. You can copy the test results directly into a comment using the markdown summary below:`
		console.log(`${intro}\n\n${body}`)
	}

	setOutput('comment-id', commentId)
}

export function parseReport(data) {
	const report = JSON.parse(data)
	if (!report?.config?.metadata || !report?.suites) {
		debug('Invalid report file', JSON.stringify(report, null, 2))
		throw new Error('Invalid report file')
	}

	const version = report.config.version
	const duration = report.config.metadata.totalTime || 0
	const workers = report.config.metadata.actualWorkers || report.config.workers || 1
	const shards = report.config.shard?.total || 0
	const projects = report.config.projects.map(project => project.name)

	const files = report.suites.map(file => file.title)
	const suites = report.suites.flatMap((file) => file.suites.length ? [...file.suites.map(suite => `${file.title} > ${suite.title}`)] : [file.title])
	const specs = report.suites.reduce((all, file) => {
		file.specs.forEach(spec => {
			all.push(parseSpec(spec, [file]))
		})
		file.suites.forEach(suite => {
			suite.specs.forEach(spec => {
				all.push(parseSpec(spec, [file, suite]))
			})
		})
		return all
	}, [])
	const tests = specs.flatMap(spec => spec.tests)
	const failed = specs.filter(spec => spec.failed)
	const passed = specs.filter(spec => spec.passed)
	const flaky = specs.filter(spec => spec.flaky)
	const skipped = specs.filter(spec => spec.skipped)

	return {
		version,
		duration,
		workers,
		shards,
		projects,
		files,
		suites,
		specs,
		failed,
		passed,
		flaky,
		skipped
	}
}

function parseSpec(spec, parents = []) {
	const { ok, line, column } = spec
	const tests = spec.tests.map(test => parseTests(test, [...parents, spec]))

	const path = [project, ...parents.map(p => p.title), spec.title].filter(Boolean)
	const title = path.join(' → ')

	const flaky = status === 'flaky'
	const skipped = status === 'skipped'
	const failed = !ok || status === 'unexpected'
	const passed = ok && !skipped && !failed
	return { passed, failed, flaky, skipped, title, path, line, column }
}

function parseTests(test, parents = []) {
	const { status, expectedStatus, projectName: project } = test
	const path = [project, ...parents.map(p => p.title), spec.title].filter(Boolean)
	const title = path.join(' → ')
	const ok = status === expectedStatus
	const flaky = status === 'flaky'
	const skipped = status === 'skipped'
	const failed = !ok || status === 'unexpected'
	const passed = ok && !skipped && !failed
	return { passed, failed, flaky, skipped, title, path }
}

export function renderReportSummary(report, { commit, message, title, reportUrl, iconStyle } = {}) {
	const { duration, failed, passed, flaky, skipped } = report
	const paragraphs = []

	// Title

	paragraphs.push(`### ${title}`)

	// Passed/failed testsd

	const tests = [
		failed.length ? `${renderIcon('failed', { iconStyle })}  **${failed.length} failed**` : ``,
		passed.length ? `${renderIcon('passed', { iconStyle })}  **${passed.length} passed**  ` : ``,
		flaky.length ? `${renderIcon('flaky', { iconStyle })}  **${flaky.length} flaky**  ` : ``,
		skipped.length ? `${renderIcon('skipped', { iconStyle })}  **${skipped.length} skipped**` : ``,
	]
	paragraphs.push(tests.filter(Boolean).join('  \n'))

	// Stats about test run

	paragraphs.push(`#### Details`)

	const stats = [
		reportUrl ? `${renderIcon('report', { iconStyle })}  [Open report ↗︎](${reportUrl})` : '',
		`${renderIcon('stats', { iconStyle })}  ${report.specs.length} ${n('test', report.specs.length)} across ${report.suites.length} ${n('suite', report.suites.length)}`,
		`${renderIcon('duration', { iconStyle })}  ${formatDuration(duration)}`,
		commit && message ? `${renderIcon('commit', { iconStyle })}  ${message} (${commit.slice(0, 7)})` : '',
		commit && !message ? `${renderIcon('commit', { iconStyle })}  ${commit.slice(0, 7)}` : '',
	]
	paragraphs.push(stats.filter(Boolean).join('  \n'))

	// Lists of failed/skipped tests

	const details = ['failed', 'flaky', 'skipped'].map((status) => {
		const tests = report[status]
		if (tests.length) {
			return `
				<details ${ status === 'failed' ? 'open' : '' }>
					<summary><strong>${upperCaseFirst(status)} tests</strong></summary>
					<ul>${tests.map((test) => `<li>${test.title}</li>`).join('\n')}</ul>
				</details>`
		}
	})
	paragraphs.push(details.filter(Boolean).map((md) => md.trim()).join('\n'))

	return paragraphs.map(p => p.trim()).filter(Boolean).join('\n\n')
}

export function renderIcon(status, { iconStyle }) {
	if (iconStyle === 'octicons') {
		const color = colors[status] || colors.icon
		return createOcticonUrl(icons.octicons[status], { label: status, color })
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

function formatDuration(milliseconds) {
	const SECOND = 1000
	const MINUTE = 60 * SECOND
	const HOUR = 60 * MINUTE
	const DAY = 24 * HOUR

	let remaining = milliseconds

	const days = Math.floor(remaining / DAY)
	remaining %= DAY

	const hours = Math.floor(remaining / HOUR)
	remaining %= HOUR

	const minutes = Math.floor(remaining / MINUTE)
	remaining %= MINUTE

	const seconds = +(remaining / SECOND).toFixed(1)

	return [
		days && `${days} ${n('day', days)}`,
		hours && `${hours} ${n('hour', hours)}`,
		minutes && `${minutes} ${n('minute', minutes)}`,
		seconds && `${seconds} ${n('second', seconds)}`,
	].filter(Boolean).join(', ')
}

function upperCaseFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

function n(str, n) {
	return n === 1 ? str : `${str}s`
}

async function fileExists(filename) {
	try {
		await fs.access(filename, fs.constants.F_OK)
		return true
	} catch (e) {
		return false
	}
}

export async function readFile(path) {
	return await fs.readFile(path, { encoding: 'utf8' })
}

if (process.env.GITHUB_ACTIONS === 'true') {
	run().catch((error) => console.error(`Error running action: ${error.message}`))
}
