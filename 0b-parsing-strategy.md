### Data parsing strategy 

In the ideal scenario, we would be able to parse BMC's data with such confidence that we can extract everything a xPAP software package (such as OSCAR) could display. I think I have gathered just enough information on the data structure to rival ResMed data import. Unfortunately, unlike ResMed's open source EDF file format, BMC uses a binary format. The advantadges are that huge amounts of data can be stored and historical data can be kept for longer. The downside is, without a published document or source code detailing the exact structure of the binary data, we can never be sure that we fully understand the way in which BMC stores their data.  I therefore propose two strategies.

#### 1. The gold prize - parse everything
We read the `.USR` file and 
* Retrieve the device's serial number, model etc.
* Read the current session in progress's start timestamp, duration and respiratory events
* Read the stored sessions for start time, duration and respiratory events

We read the `.idx` file for 
* Machine settings for each date

We read the `.nnn` file for 
* A list of waveforms, each with a timestamp

Since the only thing all of the above files have in common is a date, we can match data up using timestamps.
1. Read all sessions from the '.USR' file for the start of each session and it's duration and respiratory events
2. For each session from step 1, from the list of machine settings imported from the `.idx` file, find a packet that has a matching date.
3. Find all the waveforms loaded from the `.nnn` files and select those that fall between the session's start timestamp and end timestamp

The process could be refined further to load sessions only for a certain date perhaps, but it might be easier to load all the data from the three files into memory first. 

#### 1. The fallback strategy
The biggest concern is that the parsing of the `.USR` file could fail due. The most likely culprits are:
* The offsets from my machine could be different to another machine, and the offsets could be encoded somewhere in the file. 
* Some of the packets in the file have lengths with are hard-coded. If someone else has a packet type that my file doesn't have, and that packet has a fixed length that only BMC knows, the parser would end up in the middle of the next packet and likely fail. 
* While I hope that the data structure I have deciphered so far applies to BMC products other than the G3 A20, I might be wrong.

If we can't parse the '.USR' file, we basically lose everything else with the first strategy. In this case, the user would ideally make the SD card data available for scrutiny to see why the parser failed.
<br>

**Luckily**, the structure of the `.nnn` waveform files are well understood. While parsing the `.nnn` files, we can identify sessions by looking for breaks between packet timestamps (e.g. a break of more than 30 minutes can be seen as a new session). Using this method we can still display what 99% of users want to see: the charts.
<br>
The downsides to this method:
* The sessions will not necessarily match up with the machine's sessions, since we're using an arbitrary method to split data into sessions.
* The machine information (serial number, model, etc)  will be missing
* The daily machine settings will be missing
* The respiratory events encoded in the `.USR` file will be missing. This unfortunately means that vital information such as the AHI and compliance information will not be available.