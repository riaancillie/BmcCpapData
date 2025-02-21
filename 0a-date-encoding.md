### How dates, times and durations are encoded
Dates, when encoded on the BMC, are stored as a unsigned 16-bit integer (uint16 is 2 bytes long). 
Lets take the encoded date stored in the file as `7B 33` and figure out how it represents 2025/11/27

Since data is stored in little-endian (least significant byte fist, most significant byte last) we reverse the bytes to read it as a uint16, and we now have the value `0x337B`.
The binary representation of `0x337B` is `0011001101111011`.

The first 7 bits are `0011001` which is 25 in decimal representation. The year is offset from the year 2000, so we now know the year encoded in the date is 2025. 

The next 4 bits are `1011` which is 11 in decimal representation. The date encodes the 11th month.

The remaining 5 bits are `11011`  which is 27 in decimal representation. The date encodes the 27th day. 

The encoded date is thus 2025/11/27. 

In pseudo-code we can employ some binary arithmetic to decode the date.

```
uint16 dateEncoded = stream.ReadUInt16(); //dateEncoded = 0x337B
int year = 2000 + (dateEncoded >> 9);
int month = (dateEncoded >> 5) &  0x0f; //Shift right by 5 bits and keep only the lowest 4 bits. 
int day = dateEncoded & 0x1f; //Keep only the last 5 bits. 0b11111 = 0x1f
```