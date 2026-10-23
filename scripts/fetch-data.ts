// 從上游 tjliqy/5etools-cn（cn2.0 分支）抓原始 JSON 到 raw/。
//
// 做法：git sparse checkout。上游 repo 很大（含圖片），所以：
//   --filter=blob:none  只在需要時才下載檔案內容
//   --sparse            只 checkout data/ 目錄
//   --depth 1           不抓歷史
// 抓下來的 working copy 留在 .cache/5etools-cn（已 gitignore），之後再跑只需 fetch 差異。
// 最後把 data/ 複製成 raw/，並把 commit hash 寫進 raw/VERSION。
//
// 用法：npm run fetch-data
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = 'https://github.com/tjliqy/5etools-cn'
const BRANCH = 'cn2.0'
const CACHE = resolve('.cache/5etools-cn')
const RAW = resolve('raw')

function git(args: string[], cwd = CACHE): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

if (!existsSync(resolve(CACHE, '.git'))) {
  mkdirSync(resolve('.cache'), { recursive: true })
  console.log(`clone ${REPO} (${BRANCH})…`)
  git(
    ['clone', '--filter=blob:none', '--sparse', '--depth', '1', '--branch', BRANCH, REPO, CACHE],
    resolve('.'),
  )
  git(['sparse-checkout', 'set', 'data'])
} else {
  console.log('更新快取…')
  git(['fetch', '--depth', '1', 'origin', BRANCH])
  git(['reset', '--hard', 'FETCH_HEAD'])
}

const hash = git(['rev-parse', 'HEAD']).trim()
const date = git(['log', '-1', '--format=%cI']).trim()

rmSync(RAW, { recursive: true, force: true })
cpSync(resolve(CACHE, 'data'), RAW, { recursive: true })
writeFileSync(resolve(RAW, 'VERSION'), `${REPO}\n${BRANCH}\n${hash}\n${date}\n`)
console.log(`raw/ 已更新：${hash}（${date}）`)
