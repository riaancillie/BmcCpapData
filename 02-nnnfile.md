# The *.nnn* File (Waveforms)
BMC stores measurements recorded during therapy (lovingly referred to as *waveforms* in this repo) in file extensions with sequential numbers e.g. `serialno.001`, `serialno.002`, `serialno.003` and so on.<br>
Measurements are bundled into a 256 byte packet every second and appended to this file. This file keeps growing until it reaches 65536 packets, the maxiumum value of an unsigned 16-bit int. In file size, that would 65536 packets multiplied by 256 bytes, i.e. 16 777 216 bytes/16MB. Once this size is reached, a new file with the next sequential extension is created and data is appended there. Presumably extensions only go up to `.999`, in which case we will run out of numbers after just over two years worth of data. This also corresponds to a 16GB SD card full of data.

The structure of each packet is as follows:


|Offset Hex|Length|Short Name|Description|
|-----|---|--|---|
|`0x0000`|`uint16`|Header|Header always equal to `0xAAAA` |
|`0x0002`|`uint16`|Reslex|Reslex value |
|`0x0004`|`uint16`|IPAP|IPAP Value in cmH20 *2 |
|`0x0006`|`uint16`|EPAP|EPAP Value in cmH20 *2 |
|`0x0008`|`uint16[25]`|Unknown1|25x uint16 value representing some measurement at 25Hz |
|`0x003A`|`uint16[25]`|Unknown2|25x uint16 values representing some measurement at 25Hz |
|`0x006C`|`uint16[25]`|Flow|25x uint16 values representing flow measurement at 25Hz |
|`0x009E`|`uint16[10]`|Unknown 3|10x uint16 values representing some measurement at 10Hz |
|`0x00B2`|`uint16`|Unknown 4 Offset 0|uint16 value representing some measurement at 1Hz |
|`0x00B4`|`uint16`|Unknown 4 Offset 1|uint16 value representing some measurement at 1Hz |
|`0x00B6`|`uint16`|Unknown 4 Offset 2|uint16 value representing some measurement at 1Hz |
|`0x00B8`|`uint16`|Unknown 4 Offset 3|uint16 value representing some measurement at 1Hz |
|`0x00BA`|`uint16`|Unknown 4 Offset 4|uint16 value representing some measurement at 1Hz |
|`0x00BC`|`uint16`|Unknown 4 Offset 5|uint16 value representing some measurement at 1Hz |
|`0x00BE`|`uint16`|Unknown 4 Offset 6|uint16 value representing some measurement at 1Hz |
|`0x00C0`|`uint16`|Unknown 4 Offset 7|uint16 value representing some measurement at 1Hz |
|`0x00C2`|`uint16`|Unknown 4 Offset 8|uint16 value representing some measurement at 1Hz |
|`0x00C4`|`uint16`|Unknown 4 Offset 9|uint16 value representing some measurement at 1Hz |
|`0x00C6`|`uint16`|Tidal Volume|uint16 value representing tidal volume at 1Hz |
|`0x00C8`|`uint16`|Unknown 5 Offset 0|uint16 value representing some measurement at 1Hz |
|`0x00CA`|`uint16`|Unknown 5 Offset 1|uint16 value representing some measurement at 1Hz |
|`0x00CC`|`uint16`|Unknown 5 Offset 2|uint16 value representing some measurement at 1Hz |
|`0x00CE`|`uint16`|Unknown 5 Offset 3|uint16 value representing some measurement at 1Hz |
|`0x00D0`|`uint16`|Respiration Rate|uint16 value representing respiration rate at 1Hz |
|`0x00D2`|`uint16`|Unknown 6 Offset 0|uint16 value representing some measurement at 1Hz |
|`0x00D4`|`uint16`|Unknown 6 Offset 1|uint16 value representing some measurement at 1Hz |
|`0x00D6`|`uint16`|Unknown 6 Offset 2|uint16 value representing some measurement at 1Hz |
|`0x00D8`|`uint16`|Unknown 6 Offset 3|uint16 value representing some measurement at 1Hz |
|`0x00DA`|`uint16`|Unknown 6 Offset 4|uint16 value representing some measurement at 1Hz |
|`0x00DC`|`uint16`|Unknown 6 Offset 5|uint16 value representing some measurement at 1Hz |
|`0x00DE`|`uint16`|Unknown 6 Offset 6|uint16 value representing some measurement at 1Hz |
|`0x00E0`|`uint16`|Unknown 6 Offset 7|uint16 value representing some measurement at 1Hz |
|`0x00E2`|`uint16`|Unknown 6 Offset 8|uint16 value representing some measurement at 1Hz |
|`0x00E4`|`uint16`|Unknown 6 Offset 9|uint16 value representing some measurement at 1Hz |
|`0x00E6`|`uint16`|Unknown 6 Offset 10|uint16 value representing some measurement at 1Hz |
|`0x00E8`|`uint16`|Unknown 6 Offset 11|uint16 value representing some measurement at 1Hz |
|`0x00EA`|`uint16`|Unknown 6 Offset 12|uint16 value representing some measurement at 1Hz |
|`0x00EC`|`uint16`|Unknown 6 Offset 13|uint16 value representing some measurement at 1Hz |
|`0x00EE`|`uint16`|Unknown 6 Offset 14|uint16 value representing some measurement at 1Hz |
|`0x00F0`|`uint16`|Unknown 6 Offset 15|uint16 value representing some measurement at 1Hz |
|`0x00F2`|`uint16`|Unknown 6 Offset 16|uint16 value representing some measurement at 1Hz |
|`0x00F4`|`uint16`|Unknown 6 Offset 17|uint16 value representing some measurement at 1Hz |
|`0x00F6`|`uint16`|Unknown 6 Offset 18|uint16 value representing some measurement at 1Hz |
|`0x00F8`|`uint16`|Year|uint16 value representing year of measurement |
|`0x00FA`|`uint8`|Month|Byte value representing month of measurement |
|`0x00FB`|`uint8`|Day|Byte value representing day of measurement |
|`0x00FC`|`uint8`|Hour|Byte value representing hour of measurement |
|`0x00FD`|`uint8`|Minute|Byte value representing minute of measurement |
|`0x00FE`|`uint8`|Second|Byte value representing second of measurement |
|`0x00FF`|`uint8`|Terminator|Byte value which seems to correspond with day of week |

Descriptions of data will be updated as we determine what each unknown measurement represents. Some of the measurements may not be applicable tot CPAP and APAP machines. Some measurements may only be populated when an add-on such as the SpO2 sensor is connected.
There is also the possiblity that some of the unknown measurements are not meant to be read as uint16, but rather uint8's, possibly even boolean flag sets (e.g. humidifier element on/off).  
<br>
Some of the signals I suspect may be present but unidentified still:
* Snoring
* Flow Limitation
* Mask Pressure
* Inhalation/inspiration and exhalation/exspiration durations
* Leak Rate
