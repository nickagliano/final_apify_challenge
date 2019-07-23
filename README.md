# apify-challenge

## how to use

### 1. <b> clone the repo </b>

```bash
git clone git@github.com:nickagliano/final_apify_challenge.git
```

### 2. <b>navigate to project and download npm dependencies</b>

```bash
npm install apify --save
npm install moment
npm install rimraf
```

### 3. <b>execute main.js</b>
 
```bash
node main.js
```

## code explained

There's 2 crawlers--
 
* The first crawler starts at https://www.visithoustontexas.com/events/, gets all the event links it can find, then goes to the next page it can find (/events?page=2), and repeats until it runs out of pages. Whenever it finds an event link, it adds it to the "eventQueue", a separate requestQueue.

* After the first crawler exhausts its queue, the second crawler starts to work through the eventQueue, which has just been populated with all of the event links. On each event page, the getEventData function is called. 

* Event data is stored in the default datasets location

### functions

* *getEventData()*: the biggest function, where most of the data is being selected for. Most of the data is fairly easy to access, but some fields are much more difficult to get consistently
  * address: hard, different formattings and/or missing fields are common, (multiple "|" characters, missing street address, etc.)
  * date: very hard, especially with date ranges and recurring events
  * recurring: Hard. I took a little creative liberty and made the recurring field an array of size 7 that represents the days of the week on which the event is recurring.
    * for example, if the recurring field = [1, 0, 0, 0, 0, 1, 1], then the event is recurring on Friday, Saturday, and Sunday.
    * this array is used by the dateRangeParser()
* *parseDate()*: called by the getEventData() to process the raw date information into pretty start/end times
  * processes the 4 types of dates found on the website:
    * specific dates
    * multiple specific dates
    * date ranges that reoccur daily
    * date ranges that reoccur only on specific days of the week
  * dates can have start times and end times, only start times, or neither
  * if a date range is encountered, it's passed to the dateRangeParser() function
* *dateRangeParser()*: interprets the range of dates given and returns the appropriate individual dates
   * returns dates only if they're said to be recurring on that day
     * for example, if a range of dates was given: *Aug. 1st - Aug. 25th, Recurring weekly Saturday, Sunday*, the dateRangeParser would only return the dates which are Saturdays or Sundays between Aug. 1st and Aug. 25th

* *momentify()*: takes an array in the form of [year, month, day, hour, minute] and returns an ISO formatted string
