// const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const chromium = require("@sparticuz/chromium");

const sleep = ms => new Promise(r => setTimeout(r, ms))

exports.handler = async function(event, context) {

  const access = event.queryStringParameters.access
  const id = event.queryStringParameters.id
  const password = event.queryStringParameters.pass
  const renew = event.queryStringParameters.renew || false

  if (access !== process.env.ACCESS_CODE || id === undefined || password === undefined) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Bad access'
      })
    }
  } 

  chromium.setHeadlessMode = true;
  chromium.setGraphicsMode = false
  console.log('launch', process.env.CHROME_EXECUTABLE_PATH, chromium.args)

  const t1 = new Date()
  const browser = await puppeteer.launch({
    args: process.env.CHROME_EXECUTABLE_PATH ? [] : chromium.args,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
    headless: process.env.CHROME_EXECUTABLE_PATH ? false : chromium.headless,
  });
  console.log('browser created')

  const page = await browser.newPage()
  const t2 = new Date()
  console.log('page created')
  await page.goto('https://herts.spydus.co.uk/cgi-bin/spydus.exe/MSGTRN/WPAC/LOGINB');
  console.log('page goto complete')
  const title = await page.title();
  console.log('title', title)
  
  // Login
  await page.type('#BRWLID', id)
  await page.type('#BRWLPWD', password);
  await page.click('#submitButton');
  await page.waitForSelector('.brw-welcome-header')

  // Main data
  const name = await page.evaluate(() => {return document.querySelector('h1').textContent.replace('Welcome','').trim()})
  const pageData = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.brw-dashboard-item')).map(el => {
      return {
        type: el.querySelector('.brw-dashboard-item-footer').textContent,
        value: el.querySelector('.brw-dashboard-item-header').textContent
      }
    })
  })
  const fines = parseFloat(pageData.find(d => d.type.startsWith('Fines'))?.value.replace(/[^0-9.-]/g, '')) || 0
  const loanCount = parseInt(pageData.find(d => d.type.startsWith('Current'))?.value.replace(/[^0-9.-]/g, '')) || 0
  let loans = []
  console.log('name', name)
  console.log('fines', fines)
  console.log('loanCount', loanCount)

  if (loanCount > 0) {
    console.log('click to get loan details')
    await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a'))
        .find(el => el.href.includes('Current%20loans'))
      if (link) {
        link.click()
      }
    })
    await page.waitForSelector('.result-content-records')
  
    if (renew) {
      console.log('renew')
      await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll('a'))
          .find(el => el.textContent.includes('Renew all'))
        if (link) {
          link.click()
        }
      })
      await page.waitForSelector('.result-content-records')
    }
    loans = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.result-content-records tbody tr')).map(row => {
        return {
          name: row.querySelector('.card-title').textContent,
          img: row.querySelector('img').getAttribute('src'),
          due: row.querySelector('td[data-caption="Due"]').textContent
        }
      })
    })
    console.log('loans', loans)
  }

  const t3 = new Date()
  console.log('Time taken all', t3.getTime() - t1.getTime())
  console.log('Time taken pages', t3.getTime() - t2.getTime())


  // await sleep(1000)

  await browser.close();
  console.log('browser closed')
  return {
    statusCode: 200,
    // body: JSON.stringify({title, time:t3.getTime() - t1.getTime()})
    body: JSON.stringify({
      name,
      fines,
      loanCount,
      loans,
      timeTaken: t3.getTime() - t1.getTime(),
      id,
      password
    })
  }
}