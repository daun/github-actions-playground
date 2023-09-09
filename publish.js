import fs from 'fs/promises';
import path from 'path';

const reportRoot = './reports';
const reportAge = 6; // months

(async () => {
    console.log('Publishing reports...');
    await cleanUpOldFolders();
    await updateIndexHtml();
})();

async function getReportFolders() {
    try {
        const reportPath = path.resolve(process.cwd(), reportRoot);
        const entries = await fs.readdir(reportPath, { withFileTypes: true });
        const dirs = entries
            .filter(entry => entry.isDirectory())
            .filter(entry => isReportFolder(entry.name))
            .map(entry => entry.name);
        return dirs;
    } catch (error) {
        throw new Error(`Error reading directory: ${error.message}`)
    }
}

async function cleanUpOldFolders() {
    try {
        const reportPath = path.resolve(process.cwd(), reportRoot);
        const dirs = await getReportFolders();
        const dirsToDelete = dirs.filter(dir => shouldBeDeleted(dir));
        console.log(`Deleting ${dirsToDelete.length} old report(s)...`);
        for (const dir of dirsToDelete) {
            await fs.rm(path.join(reportPath, dir), { recursive: true, force: true });
            console.log(`Deleted report: ${dir}`);
        }
    } catch (error) {
        throw new Error(`Error reading directory: ${error.message}`)
    }
}

async function updateIndexHtml() {
    try {
        console.log('Updating index html...');
        const dirs = await getReportFolders();
        const reportPath = path.resolve(process.cwd(), reportRoot);
        const indexPath = path.join(reportPath, 'index.html');
        const htmlContent = await fs.readFile(indexPath, 'utf-8');

        const startMarker = '<!-- report-list-start -->';
        const endMarker = '<!-- report-list-end -->';
        const startIndex = htmlContent.indexOf(startMarker) + startMarker.length;
        const endIndex = htmlContent.indexOf(endMarker);

        const newReportList = dirs.map(dir => `<li><a href="./${dir}/">${formatReportName(dir)}</a></li>`).join('\n');
        const newHtmlContent = htmlContent.slice(0, startIndex) + '\n' + newReportList + '\n' + htmlContent.slice(endIndex);

        await fs.writeFile(indexPath, newHtmlContent, 'utf-8');
    } catch (error) {
        throw new Error(`Error updating index html: ${error.message}`)
    }
}

function isReportFolder(dirName) {
    return /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(dirName);
}

function formatReportName(dirName) {
    return dirName.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1-$2-$3 $4:$5:$6');
}

function shouldBeDeleted(dirName) {
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - reportAge);
    return parseDateFromDirName(dirName) < dateThreshold;
}

function parseDateFromDirName(dirName) {
    const [year, month, day, hour, minute, second] = dirName.split('-').map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
}
