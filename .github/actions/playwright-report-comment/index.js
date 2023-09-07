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
	const commentTitle = getInput('comment-title')
	const iconStyle = getInput('icon-style')

	const { eventName, repo, payload } = context
	const { owner, number: pull_number } = context.issue

	try {
		debug('pull request ' + JSON.stringify(payload, null, 2))
	} catch (e) {}

	let baseRef
	let baseSha
	if (eventName == 'push') {
		baseRef = payload.ref
		baseSha = payload.before
		console.log(`Commit pushed onto ${baseRef} (${baseSha})`)
	} else if (eventName == 'pull_request' || eventName == 'pull_request_target') {
		baseRef = payload.pull_request.base.ref
		baseSha = payload.pull_request.base.sha
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

	const data = JSON.parse(await readFile(reportPath))
	const report = parseReport(data)
	const summary = renderReportSummary(report, { title: commentTitle, iconStyle })

	const prefix = '<!-- playwright-report-github-action -->'
	const body = `${prefix}\n\n${summary}`
	let commentId = null

	if (eventName !== 'pull_request' && eventName !== 'pull_request_target') {
		console.log('No PR associated with this action run. Not posting a check or comment.')
	} else {
		startGroup(`Commenting test report on PR`)
		try {
			const { data: comments } = await octokit.issues.listComments({ ...repo, issue_number: pull_number })
			const existingComment = comments.findLast(c => c.user.type === 'Bot' && c.body.includes(prefix)) || {}
			commentId = existingComment.id || null
		} catch (error) {
			console.log(`Error fetching existing comments: ${error.message}`)
		}

		if (commentId) {
			console.log(`Updating previous comment #${commentId}`)
			try {
				await octokit.issues.updateComment({ ...repo, comment_id: commentId, body })
			} catch (error) {
				console.log(`Error updating previous comment: ${error.message}`)
				commentId = null
			}
		} else {
			console.log('Creating new comment')
			try {
				const { data: newComment } = await octokit.issues.createComment({ ...repo, issue_number: pull_number, body })
				commentId = newComment.id
			} catch (error) {
				console.log(`Error creating comment: ${error.message}`)
				console.log(`Submitting PR review comment instead...`)
				try {
					const { issue } = context
					await octokit.pulls.createReview({ owner, repo: issue.repo, pull_number: issue.number, event: 'COMMENT', body })
				} catch (e) {
					console.log(`Error creating PR review: ${error.message}`)
				}
			}
		}
		endGroup();
	}

	if (!commentId) {
		const intro = `Unable to comment on your PR — this can happen for PR's originating from a fork without write permissions. You can copy the test results directly into a comment using the markdown summary below:`
		console.log(`${intro}\n\n${body}`)
	}

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
	const shards = report.config.shard.total
	const projects = report.config.projects.map(project => project.name)

	const files = report.suites.map(file => file.title)
	const suites = report.suites.flatMap((file) => [file.title, ...file.suites.map(suite => `${file.title} > ${suite.title}`)])
	const specs = report.suites.flatMap((total, file) => [...file.specs, ...file.suites.map(suite => suite.specs)])

	return {
		version,
		duration,
		workers,
		shards,
		projects,
		files,
		suites,
		specs
	}
}

function renderReportSummary(report, { title, iconStyle }) {
	const paragraphs = []

	paragraphs.push(`### ${title}`)

	return paragraphs.map(p => p.trim()).filter(Boolean).join('\n\n')
}

function renderIcon(status, { iconStyle }) {
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
