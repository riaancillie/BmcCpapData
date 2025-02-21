# The *.idx* File (Session machine settings and link to .nnn waveform file

The `.idx` file contains daily entries about machine settings, and the offsets in the relevant `.nnn` waveform file containing the data for the day. 

The file can be split into a header and data part

|Offset Hex|Description|
|-----|-----|
|`0x00`|Header of 2048 bytes (0x800 bytes). The data in the header contains the serial number and not much else really. At least not anything usable. |
|`0x800`|The start of the first packet. Each packet is 512 bytes (0x200) long|
|`0xA00`|Second packet |
|`0xC00`|Third packet ...|

### The packet structure
Each packet contains data for one day. Offsets listed below are relative to the start of the packet

|Offset Hex|Length|Description|
|-----|---|--|
|`0x0000`|`uint16`|Header always equal to `0xAAAA` |
|`0x0002`|`uint16`|Sequential index of packet in this file|
|`0x0004`|`uint8`|Years since year 2000 |
|`0x0005`|`uint8`|Month of year |
|`0x0006`|`uint8`|Day of month |
|`0x000d`|`uint16`|Packet offset (multiply by 256 for byte offset) in `.nnn` waveform file where data for this day starts|
|`0x000f`|`uint16`|Extension of `.nnn` file where data for this day starts
|`0x0011`|`uint16`|Packet offset (multiply by 256 for byte offset) in `.nnn` waveform file where data for this day ends|
|`0x000f`|`uint16`|Extension of `.nnn` file where data for this day ends
|`0x0140`|`uint8`|Initial P in cmH20 multipled by two|
|`0x0141`|`uint8`|In `AutoCPAP Mode`: Minimum APAP<br>In `CPAP Mode` Initial P.<br> Pressure in cmH20 *2 | 
|`0x0142`|`uint8`|Ramp time in minutes or `0xff` for `Auto` | 
|`0x0144`|`uint8`|In `CPAP Mode`: Manual P in cmH20 *2 | 
|`0x0146`|`uint8`|Humidifier level (0=`Off`, 1,2,3,4,5, 6=`Auto`) | 
|`0x0147`|`uint8`|Reslex level set in clinician menu (0=`Off`,1,2,3). <br>See offset `0x0051` for `Patient` setting| 
|`0x014c`|`uint8`|Max APAP in cmH20 *2| 
|`0x014d`|`uint8`|Upper 4 bits (i.e. `0xf0`) : `Mode`: <br>`00: CPAP`<br>`01: AutoCPAP`<br>`02: S`<br>`03: S/T`<br>`04: T`<br>`05: Titration`<br>`06: AutoS`<br><br>Lower 4 bits (i.e. 0x0f): Sensitivity for `AutoCPAP Mode`| 
|`0x0151`|`uint8`|When bit 7 (`0x80`) is set, Reslex setting becomes `Patient`| 
|`0x0160`|`uint8`|Mask Type<br>`00: Full Face`<br>`01: Nasal`<br>`02: Nasal Pillow`<br>`03: Other`|
|`0x0162`|`uint8`|Air Tube Type<br>`00: 22mm Unheated`<br>`01: 15mm Unheated`<br>`02: 22mm Heated`<br>`03: 15mm Heated`|
|`0x0164`|`uint8`|Heated Tube Level<br>`00: Off`<br>`1-5`<br>`6: Auto`|
|`0x0165`|`uint8`|In `AutoCPAP Mode`: bit 1 (`0x02`) enables `SmartA`<br>In `CPAP Mode` bit 0 (`0x01`) enables `SmartC` |

When fuzzing the data, PAP Link PC showed several other settings which are applicable to BiPAP machines. Likely the data format across all BMC xPAP products are the same.