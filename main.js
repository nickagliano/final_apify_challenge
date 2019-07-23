const Apify = require('apify');
const util = require('util');
const puppeteer = require('puppeteer');
const moment = require('moment');

Apify.main(async () => {

  //requestQueue used by first crawler to paginate
  const requestQueue = await Apify.openRequestQueue();

  //eventQueue, used by second crawler (eventCrawler) to get data from event pages
  const eventQueue = await Apify.openRequestQueue('eventQueue');

  //starting url
  requestQueue.addRequest({ url: 'https://www.visithoustontexas.com/events/'});

//*****************************************************************************
//** phase I -- crawl through pages searching for as many events as possible ***
//*****************************************************************************
  // Create crawler
const crawler = new Apify.PuppeteerCrawler({
    requestQueue,
    handlePageFunction:  async ({ request, page }) => {

      //add the next page to the requestQueue to continue pagination
        try {
          await page.waitFor('a.arrow.next'); //wait for the next arrow to load
          await Apify.utils.enqueueLinks({
            page,
            selector: 'a.arrow.next', //add the next page to the requestQueue
            requestQueue });
        } catch {
          console.log("caught something");
        }

        //add the event links to the eventQueue, to later be processed by a different crawler
        try {
          await page.waitFor('div.item-int > div.info > div.title a');
          await Apify.utils.enqueueLinks({
            page,
            selector: 'div.item-int > div.info > div.title a',
            requestQueue: eventQueue });
        } catch {
          console.log("caught something");
        }

  }, //end handlePageFunction
}); // end crawler declaration

  // Run crawler
  try {
      await crawler.run();
  } catch {
      console.log("error was encountered while running crawler");
  }

//*****************************************************************************
//********* phase II -- get data from the events in the eventQueue ************
//*****************************************************************************

  // Create 2nd crawler to run through individual events in eventQueue
  const eventCrawler = new Apify.PuppeteerCrawler({
      requestQueue: eventQueue,
      handlePageFunction: getEventData,
  }); // end crawler

  // Run event crawler
  try {
      await eventCrawler.run();
  } catch {
      console.log("error was encountered while running event crawler");
  }

});//end Apify.main


//*****************************************************************************
//function called by eventCrawler to get event data from a specific event page
const getEventData = async ({ page, request }) => {

//the event object declared and initialized
  let event = {
          url: null,
          title: null,
          description: null,
    date: null,
    time: null,
    recurring: null,
    place: {
        street: null,
        city: null,
        state: null,
        postal: null,
      },
      details: {
            contact: null,
            phone: null,
            admission: null
      },
      timestamp: null
   }

  //url
  event.url = request.url;

  //grabs the div which holds info about title, date, contact, time, recurring, place
  const $wrapper = await page.$('div.detail-c2');

  //event title
  event.title = await $wrapper.$eval('h1', (el => el.textContent));

  //event description
  event.description = await page.$eval('div.description > p', (el => el.textContent));

  //temporary variable for the raw 'address' field
  const address = await $wrapper.$eval('.adrs', (el => el.textContent));

  //location variable in case address field is null
  const location = await $wrapper.$eval('.location', (el => el.textContent));

  //parsing the raw address field into street, city, state, and zip code
  //this is kind of a toughie
  if (address) {
    var addressTokens = address.split(" | ");
    event.place.street = addressTokens[0];
    event.place.city = addressTokens[addressTokens.length-1].split(",")[0].substring(1);
    event.place.state = addressTokens[addressTokens.length-1].split(",")[1].split(" ")[1];
    event.place.postal = addressTokens[addressTokens.length-1].split(",")[1].split(" ")[2];
    } else if (location){
    event.place = location;
  }

  //divArray holds the event details that do not have classes or ID's
  // (Phone, Time, Admission, and Contact)
  const divArray = await $wrapper.$$eval('div > strong',
    anchors => { return anchors.map(anchor => anchor.parentElement.textContent)});

  // loop through the array of details and parse the information if it's found
  for(var i=0;i<divArray.length;i++){
     if(divArray[i].substring(0, 5)=="Phone"){
      event.details.phone = divArray[i].split(": ")[1];
    } else if (divArray[i].substring(0,5)=="Times"){
      event.time = divArray[i].split(": ")[1];
    } else if (divArray[i].substring(0,9)=="Admission"){
      event.details.admission = divArray[i].split(": ")[1];
    } else if (divArray[i].substring(0,7)=="Contact"){
      event.details.contact = divArray[i].split(": ")[1];
    }
  }


  //grabs the rawDate
  const rawDate = await $wrapper.$eval('.dates', (el => el.innerHTML));

  const recurringArray = await $wrapper.$$eval('.dates',
    anchors => { return anchors.map(anchor => anchor.textContent)});

  const rawRecurring = recurringArray[recurringArray.length-1];

  //array variable to store the recurring days
  // mon-sun, 0 if it's not recurring on that day, 1 if it is
  var recurring = [0,0,0,0,0,0,0];

  // logic to parse recurring events
  if(await rawRecurring.indexOf("Recurring daily") > -1){
    recurring = [1,1,1,1,1,1,1];
  } else if (await rawRecurring.indexOf("Recurring weekly") > -1){
    if (await rawRecurring.indexOf("Sunday") > -1){
      recurring[0] = 1;
    }
    if (await rawRecurring.indexOf("Monday") > -1){
      recurring[1] = 1;
    }
    if (await rawRecurring.indexOf("Tuesday") > -1){
      recurring[2] = 1;
    }
    if (await rawRecurring.indexOf("Wednesday") > -1){
      recurring[3] = 1;
    }
    if (await rawRecurring.indexOf("Thursday") > -1){
      recurring[4] = 1;
    }
    if (await rawRecurring.indexOf("Friday") > -1){
      recurring[5] = 1;
    }
    if (await rawRecurring.indexOf("Saturday") > -1){
      recurring[6] = 1;
    }
  }

  if (recurring.includes(1)){ //if there's at least one day that the event is recurring
    event.recurring = recurring;
  } else {
    event.recurring = "Not recurring";
  }

  //calls the parseDate function, which returns the parsedDates (including parsed date ranges)
  event.date = await parseDate(rawDate, event.time, recurring);

  // timestamp (when event was processed)
  event.timestamp = new Date();

  //push the fully formed event object to the default dataset location
  await Apify.pushData({event});
}

//************* parseDate function ******************************************/
// converts raw date strings into ISO format using moment.js
// parseDate is called by the getEventData function
// Takes 3 parameters
// -- rawDate: unparsed date string, can be one date, many dates, on a date range
// -- rawTime: unparsed time string, ex: "7:00 PM to 10:00 PM"
// -- recurring: unparsed recurring string, ex: "Recurring weekly on Friday"
// **
// function returns an array of parsed dates
function parseDate(rawDate, rawTime, recurring) {

  //if there's many dates listed, tokenize them and store in dates array
  if(rawDate.indexOf("<br>") > -1){
    var dates = rawDate.split('<br> ');
  } else if (rawDate.indexOf('-') > -1) { //else, if there's a date range
    startDate = rawDate.split(' - ')[0];
    endDate = rawDate.split(' - ')[1];
    var dates = (dateRangeParser(startDate, endDate, rawTime, recurring));
    return dates;
  }
  for(x in dates){//for every date in the 'dates' array
      //split by whitespace, then parse tokens to get year, month, and day
      var tokens = dates[x].split(" ");
      var year = tokens[2];
      var month = moment().month(tokens[0]).format("M") - 1; //1 indexed!!!
      var day = tokens[1].substr(0,(tokens[1].length-1));

      //split rawTime string into tokens, then parse to get start and end times
      if (!rawTime==null) { //if a time was found
        if(rawTime.indexOf(" to ") > -1){ //if it's a range of time
          var timeTokens = rawTime.split(" to ");
          var startHour = timeTokens[0].split(':')[0];
          var startMinute = timeTokens[0].split(':')[1].substring(0,2);
          var endHour = timeTokens[1].split(':')[0];
          var endMinute = timeTokens[1].split(':')[1].substring(0,2);

          // logic to adjust for 24 hour clock
          if (timeTokens[0].indexOf('PM') > -1){ startHour = parseInt(startHour) + 12; }
          if (timeTokens[1].indexOf('PM') > -1){ endHour = parseInt(endHour) + 12; }

        } else { //else, it's not a range of time, just a start time
          var startHour = rawTime.split(':')[0];
          var startMinute = rawTime.split(':')[1].substring(0,2);

          // logic to adjust for 24 hour clock
          if (rawTime.indexOf('PM') > -1){ startHour = parseInt(startHour) + 12; }
          var endHour = 0; //unknown end time
          var endMinute = 0; //unknown end time
        }
      } else { //no time given/found, set all to 0
        var startHour = 0;
        var startMinute = 0;
        var endHour = 0;
        var endMinute = 0;
      }

      //arays to store the tokenized data, to then be passed to the momentify function
      var parsedStartDate = [year, month, day, startHour, startMinute];
      var parsedEndDate = [year, month, day, endHour, endMinute]

      //call to momentify to parse dates into ISO format, and store them in dates array
      dates[x]=(momentify(parsedStartDate, parsedEndDate));
    }
  //return the dates array, which now holds the dates parsed into ISO format using moment.js
  return dates;
} //end parseDate function


//******************** dateRangeParser function *******************************/
// dateRangeParser is called by the parseDate class if a range of dates is encountered
// (ex: "July 21, 2019 - July 28, 2019")
// **
// dateRangeParser takes 4 parameters
// -- startDate, start date in the form 'month_name MM, YYYY' (ex: "July 21, 2019")
// -- endDate, end date in the form 'month_name MM, YYYY' (ex: "July 28, 2019")
// -- rawTime, the raw string parsed from event page (ex: "8:00 PM to 10:30 PM")
// -- recurring, an array of days that events are recurring on, Sun-Sat = 0-6)
function dateRangeParser(startDate, endDate, rawTime, recurring){

  //tokenizing of the raw startDate into year, month, and day
  startTokens = startDate.split(" ");
  var startYear = startTokens[2];
  var startMonth = moment().month(startTokens[0]).format("M") - 1; //1 indexed!!
  var startDay = startTokens[1].substr(0,(startTokens[1].length-1));

  //tokenizing of the raw endDate into year, month, and day
  endTokens = endDate.split(" ");
  var endYear = endTokens[2];
  var endMonth = moment().month(endTokens[0]).format("M") - 1; //1 indexed!!!
  var endDay = endTokens[1].substr(0,(endTokens[1].length-1));

  if (rawTime) { //if there was a time given for the event
      var timeTokens = rawTime.split(" to ");
      if(timeTokens[1]){ //if there's a start AND end time
        var startHour = timeTokens[0].split(':')[0];
        var startMinute = timeTokens[0].split(':')[1].substring(0,2);
        var endHour = timeTokens[1].split(':')[0];
        var endMinute = timeTokens[1].split(':')[1].substring(0,2);
        // logic to adjust for 24 hour clock
        if (timeTokens[0].indexOf('PM') > -1){ startHour = parseInt(startHour) + 12; }
        if (timeTokens[1].indexOf('PM') > -1){ endHour = parseInt(endHour) + 12; }
      } else { //only a start time was given
        var startHour = rawTime.split(':')[0];
        var startMinute = rawTime.split(':')[1].substring(0,2);
        var endHour = 0;
        var endMinute = 0;
        // logic to adjust for 24 hour clock
        if (timeTokens[0].indexOf('PM') > -1){ startHour = parseInt(startHour) + 12; }
      }
  } else { //else, there was no start and end time given for the event
      var startHour = 0;
      var startMinute = 0;
      var endHour = 0;
      var endMinute = 0;
  }

  //moment objects with just year, month, and day for use in calculations
  var shortStartTime = moment([startYear, startMonth, startDay]);
  var shortEndTime = moment([endYear, endMonth, endDay]);

  //declare dateRange
  var dateRange = [];

  //get difference between start and end dates to be the stop condition for for-loop
  var difference = shortEndTime.diff(shortStartTime, 'days')+1;

  //where the range is actually parsed into individual days
  for (var i = 0; i<difference; i++){
    if(!(i==0)){ //if it's not the first run through the loop
      shortStartTime.add('days', 1); //+1 day
      if(recurring[shortStartTime.day()]==1){
        var parsedStartTime = [shortStartTime.get('year'), shortStartTime.get('month'), shortStartTime.get('date'), startHour, startMinute];
        var parsedEndTime = [shortStartTime.get('year'), shortStartTime.get('month'), shortStartTime.get('date'), endHour, endMinute];
        dateRange.push(momentify(parsedStartTime, parsedEndTime));
      }
    } else { //if it's the first loop, dont add a day
      if(recurring[shortStartTime.day()]==1){
        var parsedStartTime = [shortStartTime.get('year'), shortStartTime.get('month'), shortStartTime.get('date'), startHour, startMinute];
        var parsedEndTime = [shortStartTime.get('year'), shortStartTime.get('month'), shortStartTime.get('date'), endHour, endMinute];
        dateRange.push(momentify(parsedStartTime, parsedEndTime));
      }
    }
  }
  //return the dateRange array, which now holds the indexed individual dates found within the date range inputed
  return {dateRange};
} //end dateRangeParser function

//************************ momentify function *********************************/
// mometify is called by both the parseDate and dateRangeParser functions
//momentify function takes 2 parameters
//  -- parsedStartDate
//  -- parsedEndDate
// both arrays with the following data: [year, month, day, hour, minute]
// moment.js parses these arrays into ISO format and returns an object with
    // startTime and endTime attributes
function momentify(parsedStartDate, parsedEndDate) {
  return {startTime: moment(parsedStartDate).toISOString(),
    endTime: moment(parsedEndDate).toISOString()};
} //end momentify function
