import http from 'http'
import httpProxy from 'http-proxy'
import fs from 'fs'

const configFilename = fs.existsSync('./config.js') ? './config.js' : (() => {
  console.error('Aborting. Reason: file ./config.js not found!')
  process.exit(1)
})()

const config = (await import(configFilename)).default
const { targets, endpointTranslations } = config
const proxy = httpProxy.createProxyServer({})
const proxyPort = 3000

const targetsKeysAndValues = Object.entries(targets)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => `-> ${key}: ${value}`)
  .join('\n')

const replaceArgs = (url, args) => url.replace(/:(\d+)/g, (match, index) => args[index])

const printRequest = (regex, from, to, translatedTo) =>
  console.log(`\n--> NEW REQUEST:\nfrom: ${from}\nregex: ${regex}\nto: ${to}\nto (translated): ${translatedTo}`)

const changeRequest = (req, args, fnChangeRequest) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const params = new URLSearchParams(url.search)
  if (!fnChangeRequest(req, args, params)) req.url = `${url.pathname}?${params.toString()}`
}

const printTarget = (key, value) => console.log(`-- Target (key / value): ${key} / ${value}`)

const printHeaders = (req) => {
  console.log('-- Headers:')
  for (let [key, value] of Object.entries(req.headers)) {
    console.log(`${key}: ${value}`)
  }
}

const printArgs = (args) => {
  let i = 0
  args.forEach(arg => {
    if (i == 0) console.log('-- Args:')
    console.log(`${i++}: ${arg}`)
  })
}

const printParams = (req) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  let i = 0
  url.searchParams.forEach((value, key) => {
    if (i++ == 0) console.log('-- Params:')
    console.log(`${key}: ${value}`)
  })
}

const translateMockResult = (args, mockResult) => {
  const mock = {
    args: args.reduce((o, v, i) => (o[`:${i}`] = v, o), {}),
    currentDateTime: new Date().toISOString(),
  }
  return JSON.stringify(mockResult(mock))
}

const server = http.createServer((req, res) => {
  const getTargetValue = (targetKey) =>
      targetKey === 'mock' ? 'mock' :
      targetKey === 'default' ? targets[targets.default] :
      targets[targetKey]
  const proxyConfigurationError = (msg) => {
    const error = `Proxy configuration error! ${msg}`
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(error)
  }
  const sendMockResult = (args) => {
    if (translation.mockResult) {
      res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' })
      res.end(translateMockResult(args, translation.mockResult))
    } else {
      proxyConfigurationError('mockResult is not configured!')
    }
  }
  const translation = endpointTranslations.find(translation => translation.regex.test(req.url))

  if (translation) {
    const match = req.url.match(translation.regex)
    const from = match[0]
    const args = match.slice(1)
    const translatedTo = replaceArgs(translation.to, args) 

    printRequest(translation.regex, from, translation.to, translatedTo)

    req.url = req.url.replace(from, translatedTo)

    if (translation.changeRequest) changeRequest(req, args, translation.changeRequest)

    const targetKey = translation.target || 'default'
    const target = getTargetValue(targetKey)

    printTarget(targetKey, target)
    printArgs(args)
    printParams(req)

    if ((target === targets[targets.default] || target === 'mock') && config.setDefaultHeaders) config.setDefaultHeaders(req)

    printHeaders(req)

    if (target != 'mock') {
      if (targetKey !== 'default' && !targets[targetKey]) {
        proxyConfigurationError(`${targetKey} is not configured!`)
      } else {
        proxy.web(req, res, { target, changeOrigin: true })
      }
    } else {
      sendMockResult(args)
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

if (!targets.default) {
  console.log('The default target was not defined!')
  process.exit(1)
} else if (!targets[targets.default]) {
  console.log(`The value configured for default target (${targets.default}) was not found!`)
  process.exit(1)
}

server.listen(proxyPort, () =>
  console.log(`API Proxy/Gateway/Mock started on port ${proxyPort}\n
               Targets (default is ${targets.default}):
               ${targetsKeysAndValues}`.split('\n').map(l => l.trimStart()).join('\n')
  )
)
