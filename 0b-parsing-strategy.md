### Data parsing strategy 

In the ideal scenario, we would be able to parse BMC's data with such confidence that we can extract everything a xPAP software package (such as OSCAR) could display. I think I have gathered just enough information on the data structure to rival ResMed data import. Unfortunately, unlike ResMed's open source EDF file format, BMC uses a binary format. The advantadges are that huge amounts of data can be stored and historical data can be kept for longer. The downside is, without a published document or source code detailing the exact structure of the binary data, we can never be sure that we fully understand the way in which BMC stores their data.  I therefore propose two strategies.

#### 1. The gold prize - parse everything
We read the `.USR` file and 
* Retrieve the device's serial number, model etc.
* Read the current session in progress's start timestamp, duration and respiratory events
* Read all the stored sessions for start time, duration and respiratory events

Each `.idx` file record represents machine settings saved at least daily at noon, and a pointer to the `.nnn` waveform file and position in the file where data is currently being written. For each `.idx` record we read
* The date of the record
* The machine settings saved 
* The `.nnn` file number and offset in file.

Since data is written in a cyclic manner to the `.nnn` files, i.e. old waveforms being overwritten as new data is being recorded, we need to determine which of the `.idx` record actually have valid waveform data. 

To do this we work backwards from the latest `.idx` entry and load the `.nnn` packet the entry points to. If the date difference between the `.idx` entry and the waveform packet timestamp is more than a couple of days, we stop adding valid entries. If not, the `.idx` entry is valid and we keep a list of them. 
By doing this, we have a built a list of valid `.idx` entry with the `.nnn` packet associated with the entry.

Now we start matching up the `.USR` sessions to the valid `.idx` entries. For each session, we find the last `.idx` entry's where it's waveform packet's timestamp is less than the session's start timestamp. This gives us a rough position in the waveform file to start parsing.
For the machine settings, we simply need to look for the latest `.idx` record with the same date as the `.USR` session. 

Now that we have a link between the `.USR` session with all the respiratory events, the `.IDX` file with machine settings, the offset at which to begin looking in the `.nnn` waveform files, it's simply of matter of opening the appropriate `.nnn` file at the given offset, skip packets one by one until we find the first packet that matches the date of the session, and read packets until the timestamp exceeds noon.


When importing all data, instead of only selected dates, the above strategy is not as efficient. We could have simply loaded all the `.nnn` waveforms and matched them up to `.idx` dates. But doing so would make importing only select data (such as new sessions since last import to OSCAR) highly inefficient and very slow. Imagine parsin 1.9 million packets just to find the last 12 hours worth of it. 

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