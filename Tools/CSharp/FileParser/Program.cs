using BmcCpapFileParser;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.CodeDom;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace BmcCpapFileParser
{
    internal class Program
    {
        static void Main(string[] args)
        {            
            var folder = "2025-02-21";
            //var pathusr = $"T:\\CPAP\\BMC G3 SD Card\\{folder}\\24C36003.USR";
            //var pathusr = @"T:\CPAP\Other\Cheri\20401493.USR";
            //var pathusr = @"T:\CPAP\Other\Matt\23212180.USR";
            //var pathusr = @"T:\CPAP\Other\Techguy\22611230.USR";
            var pathusr = @"T:\CPAP\Other\bipap\22A15007.USR";
            var startTime = DateTime.Parse("2024/09/22 12:00:00");
            var endTime = DateTime.Parse("2024/09/23 11:59:00");
            var readWaveforms = false;

            List<BmcUsrSession> allUsrSessions = new List<BmcUsrSession>();
            List<BmcIdxEntry> allIdxSessions = new List<BmcIdxEntry>();
            
            List<BmcIdxEntry> validIdxSessions = new List<BmcIdxEntry>();

            List<BmcUsrIdxLink> usrIdxLinks = new List<BmcUsrIdxLink>();

            var sw = Stopwatch.StartNew();

            #region USR file parsing

            var machineInfo = ReadUsrFileMachineInfo(pathusr);
            allUsrSessions.AddRange(ReadUsrFileSessions(pathusr));
            allUsrSessions.AddRange(ReadUsrFileLatest(pathusr));

            sw.Stop();
            Console.WriteLine($"Parsing .usr files took {sw.Elapsed.ToString()}. {allUsrSessions.Count} sessions read ");
            sw.Reset();
            sw.Start();

            #endregion

            #region .IDX file parsing
            allIdxSessions = ReadIdxFile(Path.ChangeExtension(pathusr, ".idx"));

            sw.Stop();
            Console.WriteLine($"Parsing .idx files took {sw.Elapsed.ToString()}. {allIdxSessions.Count} sessions read ");
            sw.Reset();
            sw.Start();
            #endregion

            #region Get respiratory events


            //var allRespEvents = allUsrSessions.Select(x => x.RespiratoryEvents).SelectMany(x => x);

            //Console.WriteLine($"{allRespEvents.Count()} respiratory events found in .USR file");

            //var allRespEventsForThisSession = allRespEvents.Where(x => x.Start >= startTime && x.End <= endTime);

            //var groupedEvents = allRespEventsForThisSession.GroupBy(x => x.EventType).ToDictionary(x => x.Key, g => g.Select(x => new { StartTimestamp = x.Start, Duration = x.DurationSeconds }));

            //var multiSessions = allUsrSessions.GroupBy(x => x.StartTime.Date).Where(x => x.Count() > 1).ToList();

            #endregion


            #region Since .nnn waveform files are cyclicly overwritten, find valid .IDX files

            //We know that the last entry in the .IDX file is the latest so
            //  Parse all the sessions the .IDX file
            //  Work from the last session backward
            //  For each session, read the .nnn packet the IDX sessions points to
            //  If the date of the waveform packet and .IDX session packet differs by more than a couple of days
            //    we reached the part where data is being overwritten and consider that IDX session and all before it unusable
            //    since their waveform data has been overwritten

            var allIdxSessionsReversed = allIdxSessions.AsEnumerable().Reverse();

            foreach (var idxSession in allIdxSessionsReversed)
            {
                var startFilename = Path.ChangeExtension(pathusr, idxSession.StartFileExtension);
                var endFilename = Path.ChangeExtension(pathusr, idxSession.NextSessionFileExtension);
                BmcWaveformPacketPlaceholder firstNnnPacket;
                //BmcWaveformPacketPlaceholder end = null;


                using (var fs = File.OpenRead(startFilename))
                {
                    fs.Position = idxSession.StartOffsetByte;
                    firstNnnPacket = new BmcWaveformPacketPlaceholder(startFilename, new BinaryReader(fs));
                    idxSession.FirstPacket = firstNnnPacket;
                }

                if (idxSession.HasValidNextSession)
                {
                    using (var fs = File.OpenRead(endFilename))
                    {
                        fs.Position = idxSession.NextSessionOffsetByte - 256;
                        var lastNnnPacket = new BmcWaveformPacketPlaceholder(startFilename, new BinaryReader(fs));
                        idxSession.LastPacket = lastNnnPacket;
                    }
                }

                var daysDifference = Math.Abs(firstNnnPacket.Timestamp.Subtract(idxSession.Timestamp).TotalDays);

                if (daysDifference >= 3)
                    break;

                validIdxSessions.Insert(0, idxSession);
            }

            var d = validIdxSessions.Select(s => new
            {
                Index = s.Index.ToString("X2"),
                IdxTimestamp = s.Timestamp,
                FirstPacket = s.FirstPacket.Timestamp,
                LastPacket = s.LastPacket?.Timestamp
            });

            #endregion

            #region Match up .nnn file sessions to idx file

            //The USR session date starts at noon of the day e.g. 2025/02/15 12:00:00
            //The IDX session date starts at midnight, therefore for the example date, we need the USR session with date 2025/02/15 00:00:00


            foreach (var usrSession in allUsrSessions)
            {
                var foundIdxEntry = validIdxSessions.LastOrDefault(x => usrSession.StartTime >= x.FirstPacket.Timestamp);
                if (foundIdxEntry != null)
                    usrIdxLinks.Add(new BmcUsrIdxLink
                    {
                        IdxEntry = foundIdxEntry,
                        UsrSession = usrSession,
                        MachineSettings = (allIdxSessions.FirstOrDefault(x => x.Timestamp > usrSession.StartTime)?.MachineSettings) ?? (allIdxSessions.Last().MachineSettings)
                    });                
            }

            /*var minIdxStartTime = validIdxSessions.Min(x => x.Timestamp);
            var maxIdxStartTime = validIdxSessions.Max(x => x.Timestamp);

            var validSessions = allUsrSessions.Where(s => s.StartTime.Date >= minIdxStartTime);

            var links = new List<dynamic>();

            foreach (var validSession in validSessions)
            {
                var idxSession = validIdxSessions.FirstOrDefault(x => validSession.StartTime.Date == x.Timestamp.Date);
                links.Add(new
                {
                    Idx = idxSession,
                    Session = validSession
                });
                
            }*/

            Console.WriteLine($"{usrIdxLinks.Count} USR sessions with waveforms found");

            #endregion

            Console.WriteLine("\nSessions:\n-----------------------");
            var i = 0;
            foreach (var link in usrIdxLinks)
            {
                Console.Write(i.ToString().PadLeft(3));
                Console.Write(". ");
                Console.Write(link.UsrSession.StartTime.ToString("yyyy/MM/dd").PadRight(15));
                if (i % 4 == 3) Console.Write("\n");
                i++;
                
            }
            Console.WriteLine("");
            Console.Write("\nSelect a session: ");
            int selectedLinkIdx = int.Parse(Console.ReadLine());



            var selectedUsrIdxLink = usrIdxLinks[selectedLinkIdx];

            sw.Reset();
            sw.Start();
            var session = ReadSession(pathusr, selectedUsrIdxLink);
            Console.WriteLine($"Read session took {sw.Elapsed.ToString()}. Writing JSON file");


            #region .nnn file parsing

            //List<BmcWaveformPacket> waveformPackets = new List<BmcWaveformPacket>();
            //List<BmcWaveformPacketPlaceholder> waveformPacketsPlaceholders = new List<BmcWaveformPacketPlaceholder>();

            //var nnnFile = 0;

            //sw = Stopwatch.StartNew();

            //DateTime minDate = DateTime.MaxValue;
            //DateTime maxDate = DateTime.MinValue;

            //while (true)
            //{
            //    var extension = nnnFile.ToString("000");
            //    var pathnnn = Path.ChangeExtension(pathusr, extension);

            //    if (!File.Exists(pathnnn))
            //        break;

            //    nnnFile++;

            //    //var bytes = System.IO.File.ReadAllBytes(pathnnn);

            //    //var ms = new MemoryStream(bytes);


            //    var fs = new FileStream(pathnnn, System.IO.FileMode.Open);

            //    var c = new BinaryReader(fs);

            //    while (fs.Position != fs.Length)
            //    {
            //        if (readWaveforms)
            //        {
            //            var packet = new BmcWaveformPacket(c);                        
            //            waveformPackets.Add(packet);                        
            //        } 
            //        else
            //        {
            //            var placeholder = new BmcWaveformPacketPlaceholder(pathnnn, c);
            //            waveformPacketsPlaceholders.Add(placeholder);
            //            if (placeholder.Timestamp < minDate) minDate = placeholder.Timestamp;
            //            if (placeholder.Timestamp > maxDate) maxDate = placeholder.Timestamp;
            //        }
            //    }

            //}

            //sw.Stop();
            //Console.WriteLine($"Parsing .nnn files took {sw.Elapsed.ToString()}. {(!readWaveforms ? waveformPacketsPlaceholders.Count : waveformPackets.Count)} {(!readWaveforms ? "placeholders" : "packets")} read");

            //var packetDates = waveformPacketsPlaceholders.GroupBy(x => x.Timestamp.Date).ToList();

            //var data = waveformPackets
            //    .SkipWhile(x => x.Timestamp <= startTime)
            //    .TakeWhile(x => x.Timestamp <= endTime);


            #endregion

            #region debug
            /*var pk = packets.FirstOrDefault(x => x.Timestamp > DateTime.Parse("2025/02/15 12:00:00"));
            var idx = packets.IndexOf(pk);
            var offset = idx * 256;

            var result = "";

            var packetStart = packets.FindIndex(x => x.Timestamp >= DateTime.Parse("2025/02/15 01:33:55"));

            var data = packets.Skip(packetStart).Take(60);

            var csv = new BmcCsvList(data);*/



            //Different signals in one List<>
            //var ranges = packets.Skip(packetStart).Take(60).Select(x => x.Unknown6Ints);



            /*foreach (var range in ranges)
            {
                foreach (var item in range)
                    result += item.ToString() + "\t";

                result += "\r\n";
            }*/

            //One signal in one List<>
            /*var ranges = packets.Skip(packetStart).Take(60).Select(x => x.TidalVolume);
            foreach (var range in ranges)
            {
                foreach (var item in range)
                    result += item.ToString() + "r\n";                
            }*/

            //Discrete measure per packet
            /*var ranges = packets.Skip(packetStart).Take(60).Select(x => x.Terminator);
            foreach (var item in ranges)
                result += item + "\r\n";*/

            //var termsNot4 = waveformPackets.GroupBy(x => x.Terminator).ToList();
            //var termsUnique = waveformPackets.Select(x => x.Terminator).ToList().Distinct().ToList();

            #endregion

            //var result = JsonConvert.SerializeObject(packets, Formatting.Indented);
            //Console.WriteLine(result);



            //Object data = null;

            var mappedEvents = session.RespiratoryEvents.GroupBy(x => x.EventType).ToDictionary(x => x.Key, g => g.Select(x => new { StartTimestamp = x.Start, Duration = x.DurationSeconds }));

            var jsonData = new
            {
                Name = session.Date.ToString("yyyy/MM/dd HH:mm:ss") + " - " + endTime.ToString("HH:mm:ss"),
                Events = mappedEvents,
                Packets = session.Waveforms,
                MachineSettings = selectedUsrIdxLink.MachineSettings,
                MachineInfo = machineInfo
            };

            var json = JsonConvert.SerializeObject(jsonData, Formatting.Indented);
            var exportPath = $"t:\\CPAP\\{machineInfo.SerialNumber}-{session.Date.ToString("yyyyMMdd")}.json";
            System.IO.File.WriteAllText(exportPath, json);

            Console.WriteLine($"JSON exported to {exportPath}");
            Console.ReadKey();

        }

        public static BmcSession ReadSession(string aUsrFilePath, BmcUsrIdxLink aLink)
        {
            var session = new BmcSession();
            session.Date = aLink.UsrSession.StartTime;
            session.RespiratoryEvents = aLink.UsrSession.RespiratoryEvents;
            session.MachineSettings = aLink.IdxEntry.MachineSettings;

            var readCompleted = false;

            var waveformFilePath = Path.ChangeExtension(aUsrFilePath, aLink.IdxEntry.StartFileExtension);
            var waveformFileOffset = aLink.IdxEntry.StartOffsetByte;
            BmcWaveformPacket lastPacket = null;
            var sessionEndTimestamp = aLink.UsrSession.StartTime.AddDays(1);

            while (!readCompleted)
            {
                using (var f = File.OpenRead(waveformFilePath))
                {
                    BinaryReader rdr = new BinaryReader(f);
                    f.Position = waveformFileOffset;

                    while (f.Position < f.Length)
                    {
                        BmcWaveformPacket packet = new BmcWaveformPacket(rdr);

                        //If the packet we just read is earlier than the previous one, the file has wrapped before noon and the data is incomplete.
                        if (lastPacket != null && packet.Timestamp < lastPacket.Timestamp)
                        {
                            readCompleted = true;
                            break;
                        }

                        lastPacket = packet;

                        //If the packet is earlier than the session start timestamp skip it
                        if (packet.Timestamp < session.Date)
                            continue;

                        //If the packet is later than the session end timestamp then all waveforms are read.
                        if (packet.Timestamp >= sessionEndTimestamp)
                        {
                            readCompleted = true;
                            break;
                        }

                        //This packet belongs to this session. Add it
                        session.Waveforms.Add(packet);
                           
                    }

                    waveformFilePath = GetNextNnnFile(waveformFilePath);
                    waveformFileOffset = 0x800;
                }
            }

            return session;
            
        }

        public static string GetNextNnnFile(string aCurrentFilePath)
        {
            var currentExtension = int.Parse(aCurrentFilePath.Substring(aCurrentFilePath.Length - 3));
            var newPath = Path.ChangeExtension(aCurrentFilePath, (currentExtension+1).ToString("000"));
            if (!System.IO.File.Exists(newPath))
                return Path.ChangeExtension(aCurrentFilePath, "000");
            else
                return newPath;
        }

        public static IEnumerable<BmcUsrSession> ReadUsrFileSessions(string aPath)
        {
            var sessions = new List<BmcUsrSession>();

            using (var strm = System.IO.File.OpenRead(aPath))
            {
                strm.Position = 0x102338;

                List<int> msgTypes = new List<int>();

                BinaryReader b = new BinaryReader(strm);
                var sessionCount = b.ReadUInt16();
                b.ReadUInt16();
                b.ReadUInt16();
                b.ReadUInt16();

                var lastMessageType = 0;
                long lastMessageOffset = 0;

                while (true)
                {
                    var session = new BmcUsrSession();
                    sessions.Add(session);

                    var header = b.ReadByte();
                    b.ReadUInt16();
                    b.ReadUInt16();
                    b.ReadUInt16();

                    var b1 = b.ReadByte();
                    var b2 = b.ReadByte();
                    var sessionDate = DecodeDate(b1, b2);
                    session.StartTime = sessionDate;

                    b.ReadUInt16();
                    b.ReadUInt16();
                    b.ReadUInt16();

                    var sessionDurationMinutes = b.ReadUInt16();
                    var sessionDuration = TimeSpan.FromMinutes(sessionDurationMinutes);
                    session.Duration = sessionDuration;

                    byte[] tmpBuffer = new byte[256];

                    b.Read(tmpBuffer, 0, 52);

                    while (true)
                    {
                        int msgType = b.ReadByte();
                        var d1 = b.ReadInt16();
                        var d2 = b.ReadInt16();

                        if (msgType == 0xff)
                            break;
                    }

                    while (true)
                    {
                        int msgType = b.ReadByte();

                        if (msgType < 0x80 || msgType > 0x8f)
                            throw new Exception("Invalid message type");

                        if (!msgTypes.Contains(msgType))
                            msgTypes.Add(msgType);

                        lastMessageType = msgType;
                        lastMessageOffset = strm.Position - 1;

                        var length = b.ReadInt16();
                        b.ReadInt16();

                        for (var i = 0; i < length; i++)
                        {
                            if (msgType == 0x86 || msgType == 0x82)
                            {
                                var dt = b.ReadInt32();
                            }
                            else if (msgType == 0x84 || msgType == 0x83 || /* msgType == 0x85 ||*/ msgType == 0x87)
                            {
                                b.Read(tmpBuffer, 0, 3);


                                if (msgType == 0x84 || msgType == 0x83 || msgType == 0x87)
                                {
                                    var evt = new BmcRespiratoryEvent(msgType, tmpBuffer, sessionDate);
                                    session.RespiratoryEvents.Add(evt);
                                }


                            }
                            else
                            {
                                var dt = b.ReadInt16();
                            }

                        }

                        if (strm.Position == strm.Length || PeekByte(strm) == 0xE1)
                            break;
                    }

                    if (strm.Position == strm.Length)
                        break;

                }
            }

            return sessions;
        }

        public static List<BmcIdxEntry> ReadIdxFile(string aPath)
        {
            using (FileStream f = File.OpenRead(aPath))
            {
                BinaryReader rdr = new BinaryReader(f);
                f.Position = 0x800;

                var indexDays = new List<BmcIdxEntry>();

                while (f.Position < f.Length)
                {
                    var indexedDay = new BmcIdxEntry(rdr);
                    indexDays.Add(indexedDay);
                }

                return indexDays;
            }
        }

        public static int PeekByte(Stream strm)
        {
            var b = strm.ReadByte();
            strm.Position = strm.Position - 1;
            return b;
        }

        public static DateTime DecodeDate(int byte1, int byte2)
        {
            return DecodeDate((UInt16)((byte2 << 8) | byte1));
        }

        public static DateTime DecodeDate(UInt16 aDate)
        {
            var year = aDate >> 9;
            var month = (aDate >> 5) & 0xf;
            int day = aDate & 0x1f;
            DateTime startDate = new DateTime(2000+year, month, day, 12, 0, 0);
            return startDate;

            //var year = (byte2 / 2) + 2000;
            //int remainder = byte2 % 2 == 0 ? 0x00 : 0x100;
            //var tmp = remainder + (int)byte1;

            //int month = (tmp >> 4) / 2;

            //remainder = (tmp >> 4) % 2 == 0 ? 0x00 : (int)0x10;
            //var day = remainder + (byte1 & 0x0f);

            //DateTime startDate = new DateTime(year, month, day, 12, 0, 0);
            //return startDate;
        }



        public static IEnumerable<BmcUsrSession> ReadUsrFileLatest(string aPath)
        {
            BmcUsrSession session = new BmcUsrSession();
            
            var items = new List<BmcTodaySessionDataItem>();
            using (var strm = System.IO.File.OpenRead(aPath))
            {
                var events = new List<BmcRespiratoryEvent>();

                strm.Position = 0x431;
                var byte1 = strm.ReadByte();
                var byte2 = strm.ReadByte();


                DateTime startDate = DecodeDate(byte1, byte2);
                session.StartTime = startDate;


                strm.Position = 0x441;
                do
                {
                    BmcTodaySessionDataItem itm = new BmcTodaySessionDataItem();
                    itm.ItemType = strm.ReadByte();
                    if (itm.ItemType == 0xff)
                        break;

                    if (itm.ItemType == 0x02)
                    {
                        itm.DataLength = 3;
                    }
                    else
                    {
                        itm.DataLength = strm.ReadByte();
                    }


                    itm.Data = new byte[itm.DataLength];
                    strm.Read(itm.Data, 0, itm.DataLength);
                    items.Add(itm);

                } while (true);

                events = items.Where(x => x.ItemType >= 0x07 && x.ItemType <= 0x09).Select(x => new BmcRespiratoryEvent(x, startDate)).ToList();
                session.RespiratoryEvents.AddRange(events);

                //var str = JsonConvert.SerializeObject(items, Formatting.Indented);
            }

            return new BmcUsrSession[] { session };
            
        }

        public static BmcMachineInfo ReadUsrFileMachineInfo(string aUsrPath)
        {
            var machineInfo = new BmcMachineInfo();

            using (var f = File.OpenRead(aUsrPath))
            {
                BinaryReader rdr = new BinaryReader(f);
                f.Position = 0x2d;
                machineInfo.SerialNumber = rdr.ReadNullTerminatedString().Trim();
                f.Position = 0x2296;
                machineInfo.Model = rdr.ReadNullTerminatedString().Trim();
            }

            return machineInfo;
        }

    }

    public class BmcWaveformPacket
    {
        public DateTime Timestamp { get; protected set; }

        public int Reslex { get; protected set; }
        public float IPAP { get; protected set; }
        public float EPAP { get; protected set; }

        public List<int> Unknown1 { get; protected set; }
        public List<int> Unknown2 { get; protected set; }

        public List<float> Flow { get; protected set; }

        public List<int> Unknown3 { get; protected set; }

        [JsonIgnore]
        public byte[] Unknown4 { get; protected set; }
        public List<int> Unknown4Ints { get; protected set; }

        [JsonIgnore]
        public byte[] Unknown5 { get; protected set; }

        public List<int> Unknown5Ints { get; protected set; }

        [JsonIgnore]
        public byte[] Unknown6 { get; protected set; }
        public List<int> Unknown6Ints { get; protected set; }

        public int TidalVolume { get; protected set; }

        public int RespirationRate { get; protected set; }      
        
        public int Terminator { get; protected set; }

        public BmcWaveformPacket()
        {
            Unknown1 = new List<int>();
            Unknown2 = new List<int>();
            Unknown3 = new List<int>();
            Unknown4Ints = new List<int>();
            Unknown5Ints = new List<int>();
            Unknown6Ints = new List<int>();
            this.Flow = new List<float>();
        }

        public BmcWaveformPacket(BinaryReader aReader) : this()
        {
            var header = aReader.ReadUInt16();  //0 / 2
            this.Reslex = aReader.ReadUInt16(); //2 / 2
            this.IPAP = (aReader.ReadUInt16()) / 2.0f;  //4 / 2
            this.EPAP = (aReader.ReadUInt16()) / 2.0f;  //6 / 2

            for (int i = 0; i < 25; i++)     // 8 / 50      
                this.Unknown1.Add(aReader.ReadUInt16());

            for (int i = 0; i < 25; i++)  //58 / 50
                this.Unknown2.Add(aReader.ReadUInt16());

            for (int i = 0; i < 25; i++)  //108 / 50
                this.Flow.Add(aReader.ReadInt16() / 10.0f);

            for (int i = 0; i < 10; i++) //158 / 20
                this.Unknown3.Add(aReader.ReadUInt16());  

            this.Unknown4 = aReader.ReadBytes(20);  //178 / 20
            aReader.BaseStream.Position = aReader.BaseStream.Position - 20;
            for (int i = 0; i < 10; i++) //158 / 20
                this.Unknown4Ints.Add(aReader.ReadUInt16());


            this.TidalVolume = aReader.ReadUInt16(); //198 / 2

            this.Unknown5 = aReader.ReadBytes(8); //200 / 8
            aReader.BaseStream.Position = aReader.BaseStream.Position - 8;
            for (int i = 0; i < 4; i++) 
                this.Unknown5Ints.Add(aReader.ReadUInt16());

            this.RespirationRate = aReader.ReadUInt16(); //208

            this.Unknown6 = aReader.ReadBytes(38); //210 / 38
            aReader.BaseStream.Position = aReader.BaseStream.Position - 38;
            for (int i = 0; i < 19; i++) 
                this.Unknown6Ints.Add(aReader.ReadUInt16());

            var year = aReader.ReadUInt16(); // 248 / 2
            var month = aReader.ReadByte(); // 250 / 1
            var day = aReader.ReadByte(); // 251 / 1
            var hour = aReader.ReadByte(); // 252 / 1
            var minute = aReader.ReadByte(); // 253 / 1
            var second = aReader.ReadByte(); // 254 / 1
            this.Terminator = aReader.ReadByte(); // 255 / 1

            this.Timestamp = new DateTime(year, month, day, hour, minute, second);

        }
    }

    public class BmcWaveformPacketPlaceholder
    {
        public DateTime Timestamp { get; protected set; }
        public string Filename { get; set; }

        public long ByteOffset { get; set; }
        

        public BmcWaveformPacketPlaceholder()
        {
            
        }

        public BmcWaveformPacketPlaceholder(string Filename,  BinaryReader aReader) : this()
        {
            this.Filename = Filename;
            ByteOffset = aReader.BaseStream.Position;
            aReader.BaseStream.Position += 0xF8;
            var year = aReader.ReadUInt16(); // 248 / 2
            var month = aReader.ReadByte(); // 250 / 1
            var day = aReader.ReadByte(); // 251 / 1
            var hour = aReader.ReadByte(); // 252 / 1
            var minute = aReader.ReadByte(); // 253 / 1
            var second = aReader.ReadByte(); // 254 / 1
            var terminator = aReader.ReadByte(); // 255 / 1

            this.Timestamp = new DateTime(year, month, day, hour, minute, second);

        }
    }

    public class BmcCsvList
    {
        public string IPAP { get; set; } = "";
        public string EPAP { get; set; } = "";
        public string Reslex { get; set; } = "";


        public string Unknown1 { get; set; } = "";
        public string Unknown2 { get; set; } = "";
        public string Flow { get; set; } = "";
        public string Unknown3 { get; set; } = "";
        public string Unknown4 { get; set; } = "";
        public string TidalVolume { get; set; } = "";
        public string RespirationRate { get; set; } = "";
        public string Unknown5 { get; set; }

        public string Unknown6 { get; set; }
        public string Terminator { get; set; }

        protected string MakeSignalArrayList(IEnumerable<List<int>> input)
        {
            string result = "";
            foreach (var list in input)
            {
                foreach (var item in list)
                    result += item.ToString() + "\r\n";
            }
            return result;
        }


        protected string MakeSignalArrayList(IEnumerable<List<float>> input)
        {
            string result = "";
            foreach (var list in input)
            {
                foreach (var item in list)
                    result += item.ToString() + "\r\n";
            }
            return result;
        }

        protected string MakeMultipleSignalArrayList(IEnumerable<List<int>> input)
        {
            string result = "";
            foreach (var list in input)
            {
                foreach (var item in list)
                    result += item.ToString() + "\t";

                result += "\r\n";
            }
            return result;
        }

        protected string MakeDiscreteValueList(IEnumerable<int> input)
        {
            string result = "";
            foreach (var item in input)
            {
                result += item.ToString() + "\r\n";
            }
            return result;
        }

        protected string MakeDiscreteValueList(IEnumerable<float> input)
        {
            string result = "";
            foreach (var item in input)
            {
                result += item.ToString() + "\r\n";
            }
            return result;
        }

        public BmcCsvList(IEnumerable<BmcWaveformPacket> aData)
        {
            this.IPAP = MakeDiscreteValueList(aData.Select(x => x.IPAP));
            this.EPAP = MakeDiscreteValueList(aData.Select(x => x.EPAP));
            this.Reslex = MakeDiscreteValueList(aData.Select(x => x.Reslex));

            this.Unknown1 = MakeSignalArrayList(aData.Select(x => x.Unknown1));
            this.Unknown2 = MakeSignalArrayList(aData.Select(x => x.Unknown2));
            this.Flow = MakeSignalArrayList(aData.Select(x => x.Flow));
            this.Unknown3 = MakeSignalArrayList(aData.Select(x => x.Unknown3));
            this.Unknown4 = MakeMultipleSignalArrayList(aData.Select(x => x.Unknown4Ints));
            this.TidalVolume = MakeDiscreteValueList(aData.Select(x => x.TidalVolume));
            this.RespirationRate = MakeDiscreteValueList(aData.Select(x => x.RespirationRate));
            this.Unknown5 = MakeMultipleSignalArrayList(aData.Select(x => x.Unknown5Ints));
            this.Unknown6 = MakeMultipleSignalArrayList(aData.Select(x => x.Unknown6Ints));
            this.Terminator = MakeDiscreteValueList(aData.Select(x => x.Terminator));

        }



    }

    public class BmcTodaySessionDataItem
    {
        public int ItemType { get; set; }
        public int DataLength { get; set; }
        [JsonIgnore]
        public byte[] Data { get; set; }

        public List<int> DataBytes { get { return Data.Select(x => (int)x).ToList(); } }
    }


    public class BmcRespiratoryEvent
    {
        public string EventType { get; set; }
        public DateTime Start{ get; set; }
        public DateTime End { get; set; }
        
        public int DurationSeconds { get; set; }

        public BmcRespiratoryEvent(BmcTodaySessionDataItem data, DateTime startTime) 
        {
            this.Start = startTime.AddHours(data.DataBytes[0]).AddMinutes(data.DataBytes[1]);
            this.DurationSeconds = data.DataBytes[2];
            this.End = this.Start.AddSeconds(DurationSeconds);

            switch (data.ItemType)
            {
                case 09: this.EventType = "HYP"; break;
                case 08: this.EventType = "OSA"; break;
                case 07: this.EventType = "CSA"; break;
                default: this.EventType = "UNKNOWN"; break;
            }
        }

        public BmcRespiratoryEvent(int aSessionDataItemType, byte[] data, DateTime startTime)
        {
            this.Start = startTime.AddHours(data[0]).AddMinutes(data[1]);
            this.DurationSeconds = data[2];
            this.End = this.Start.AddSeconds(DurationSeconds);

            switch (aSessionDataItemType)
            {
                case 0x84: this.EventType = "HYP"; break;
                case 0x83: this.EventType = "OSA"; break;
                case 0x87: this.EventType = "CSA"; break;
                default: this.EventType = "UNKNOWN"; break;
            }
        }

        

    }

    public class BmcUsrSession
    {
        public DateTime StartTime { get; set; }
        public TimeSpan Duration { get; set; }

        public List<BmcRespiratoryEvent> RespiratoryEvents { get; set; } = new List<BmcRespiratoryEvent>();
    }

    public class BmcIdxEntry
    {
        public DateTime Timestamp { get; set; }        
        public int Index { get; set; }

        public int StartOffsetPacket { get; set; }
        public int StartOffsetByte { get { return StartOffsetPacket * 256; } }

        public int StartFileIndex { get; set; }
        public string StartFileExtension { get { return StartFileIndex.ToString("000"); } }        

        public BmcWaveformPacketPlaceholder FirstPacket { get; set; }
        public BmcWaveformPacketPlaceholder LastPacket { get; set; }

        public int NextSessionOffsetPacket { get; set; }
        public int NextSessionOffsetByte { get { return NextSessionOffsetPacket * 256; } }

        public bool HasValidNextSession { get; set; }

        public int NextSessionFileIndex { get; set; }
        public string NextSessionFileExtension { get { return NextSessionFileIndex.ToString("000"); } }

        public BmcMachineSettings MachineSettings {get;set;}

        public BmcIdxEntry()
        {
            MachineSettings = new BmcMachineSettings();
        }

        public BmcIdxEntry(BinaryReader rdr) : this()
        {
            byte[] tmpBuf = new byte[256];
            byte b = 0;
            float f = 0;

            var header = rdr.ReadUInt16(); //00
            if (header != 0xAAAA) 
                throw new Exception($".IDX read failed. Header expected 0xAAAA. Offset 0x{(rdr.BaseStream.Position-4).ToString("X2")}");

            this.Index = rdr.ReadUInt16(); //02
            int year = (int)rdr.ReadByte() + 2000;  //04
            int month = rdr.ReadByte();  //05
            int day = rdr.ReadByte();  //06

            Timestamp = new DateTime(year, month, day, 0, 0, 0);

            rdr.ReadBytes(6); //07

            StartOffsetPacket = rdr.ReadUInt16(); //0D
            StartFileIndex = rdr.ReadByte(); //0f            
            rdr.ReadByte(); //10
            NextSessionOffsetPacket = rdr.ReadUInt16(); //11
            NextSessionFileIndex = rdr.ReadByte(); //13
            rdr.ReadByte(); //14

            HasValidNextSession = NextSessionFileIndex != 0xFF;                 

            rdr.ReadBytes(0x12b); //15

            f = (float)rdr.ReadByte() / 2.0f; //140
            MachineSettings.APAP_IntialP = MachineSettings.CPAP_InitialP = MachineSettings.S_InitialEPAP = MachineSettings.AutoS_InitialEPAP = f;
            
            f = (float)rdr.ReadByte() / 2.0f; //141
            MachineSettings.CPAP_TreatP = MachineSettings.APAP_MinAPAP = MachineSettings.S_EPAP = MachineSettings.AutoS_MinEPAP = f;

            MachineSettings.RampTimeMinutes = rdr.ReadByte(); //142
            rdr.ReadByte(); //143
            
            MachineSettings.CPAP_ManualP = (float)rdr.ReadByte() / 2.0f; //144            
            
            b = rdr.ReadByte(); //145
            MachineSettings.S_BackupRR = (b & 0x80) != 0;
            
            MachineSettings.HumidifierLevel = rdr.ReadByte(); //146
            
            b = rdr.ReadByte(); //147
            MachineSettings.LeakAlert = (b & 0x40) != 0;
            MachineSettings.AutoOff = (b & 0x02) != 0;
            MachineSettings.AutoOn = (b & 0x01) != 0;


            b = rdr.ReadByte(); //148
            MachineSettings.Reslex = b & 0x3;
            f = (float)(b >> 2) / 2.0f;
            MachineSettings.S_IPAP = MachineSettings.S_EPAP + f;
            MachineSettings.AutoS_MinIPAP = MachineSettings.AutoS_MinEPAP + f;

            b = rdr.ReadByte(); //149
            MachineSettings.AutoS_ISENS = MachineSettings.S_ISENS = 1 + (b & 0x07);
            MachineSettings.AutoS_ESENS = MachineSettings.S_ESENS = 1 + ((b >> 3) & 0x07);

            rdr.ReadBytes(2); //14a
            
            f = (float)rdr.ReadByte() / 2.0f; //14c            
            MachineSettings.APAP_MaxAPAP = MachineSettings.AutoS_MaxIPAP = f;
            
            b = rdr.ReadByte(); //14d
            MachineSettings.Mode = (BmcMachineSettings.BmcMode)(b >> 4);
            MachineSettings.APAP_Sensitivity = b & 0x0f;

            b = rdr.ReadByte(); //14e

            b = rdr.ReadByte(); //14f
            MachineSettings.AutoS_RiseTime = MachineSettings.S_RiseTime = 1 + (b >> 6);

            b = rdr.ReadByte(); //150            

            MachineSettings.ReslexPatient = (rdr.ReadByte() & 0x80) != 0; //151

            b = rdr.ReadByte(); //152
            MachineSettings.S_TiMin = (float)b / 10.0f;

            b = rdr.ReadByte(); //153            
            MachineSettings.S_TiMax = (float)b / 10.0f;

            rdr.ReadBytes(0x0c); //154
            
            MachineSettings.MaskType = (BmcMachineSettings.BmcMaskType)rdr.ReadByte(); //160
            
            rdr.ReadByte(); //161            
            
            MachineSettings.AirTubeType = (BmcMachineSettings.BmcAirTubeType)rdr.ReadByte(); //162
            
            rdr.ReadByte(); //163
            
            MachineSettings.HeatedTubeLevel = rdr.ReadByte(); // 164

            b = rdr.ReadByte(); //165
            MachineSettings.APAP_SmartA = (b & 0x02) != 0;
            MachineSettings.CPAP_SmartC = (b & 0x01) != 0;
            MachineSettings.AutoS_SmartB = (b & 0x04) != 0;

            rdr.ReadBytes(0x9a); //166 - 200
        }

    }
    

    public class BmcMachineSettings
    {
        public enum BmcMode
        {
            CPAP = 0,
            AutoCPAP,
            S,
            ST,
            T,
            Titration,
            AutoS
        }

        public enum BmcMaskType
        {
            FullFace = 0,
            Nasal,
            NasalPillow,
            Other
        }

        public enum BmcAirTubeType
        {
            Unheated22mm = 0,
            Unheated15mm,
            Heated22mm,
            Unheadted15mm
        }



        public int Reslex { get; set; }
        public bool ReslexPatient { get; set; }


        public int RampTimeMinutes { get; set; }
        

        public int HumidifierLevel { get; set; }
        public string HumidifierLevelString { get
            {
                return HumidifierLevel switch
                {
                    0 => "Off",
                    (> 0) and (< 6) => HumidifierLevel.ToString(),
                    6 => "Auto",
                    _ => "Unknown"
                };
            } 
        }


        
        public float APAP_IntialP { get; set; }
        public float APAP_MinAPAP { get; set; }
        public float APAP_MaxAPAP { get; set; }
        public int APAP_Sensitivity { get; set; }
        public bool APAP_SmartA { get; set; }


        public float CPAP_InitialP { get; set; }
        public float CPAP_TreatP { get; set; }
        public float CPAP_ManualP { get; set; }
        public bool CPAP_SmartC { get; set; }

        
        public float S_InitialEPAP { get; set; }
        public float S_EPAP { get; set; }
        public float S_IPAP{ get; set; }
        public int S_ISENS { get; set; }
        public float S_ESENS { get; set; }
        public int S_RiseTime{ get; set; }
        public float S_TiMin { get; set; }
        public float S_TiMax { get; set; }
        public bool S_BackupRR { get; set; }
        
        public float AutoS_InitialEPAP { get; set; }
        public float AutoS_MinEPAP { get; set; }
        public float AutoS_MinIPAP { get; set; }
        public float AutoS_MaxIPAP { get; set; }

        public int AutoS_ISENS { get; set; }
        public float AutoS_ESENS { get; set; }
        public int AutoS_RiseTime { get; set; }

        public bool AutoS_SmartB { get; set; }



        public bool LeakAlert { get; set; }
        public bool AutoOn { get; set; }
        public bool AutoOff { get; set; }

        [JsonConverter(typeof(StringEnumConverter))]
        public BmcMode Mode { get; set; }

        [JsonConverter(typeof(StringEnumConverter))]
        public BmcMaskType MaskType { get; set; }
        [JsonConverter(typeof(StringEnumConverter))]
        public BmcAirTubeType AirTubeType { get; set; }
        public int HeatedTubeLevel { get; set; }

        public string HeatedTubeLevelString { get 
            {
                return HeatedTubeLevel switch
                {
                    0 => "Off",
                    (> 0) and (< 6) => HeatedTubeLevel.ToString(),
                    6 => "Auto",
                    _ => "Unknown"
                };
            } 
        }

        
        
    }


    public class BmcUsrIdxLink
    {
        public BmcIdxEntry IdxEntry { get; set; }
        public BmcUsrSession UsrSession { get; set; }

        public BmcMachineSettings MachineSettings { get; set; }

    }

    public class BmcSession
    {
        public DateTime Date { get; set; }
        public List<BmcWaveformPacket> Waveforms { get; set; }
        public List<BmcRespiratoryEvent> RespiratoryEvents { get; set; }
        public BmcMachineSettings MachineSettings { get; set; }

        public BmcSession()
        {
            Waveforms = new List<BmcWaveformPacket>();
            RespiratoryEvents = new List<BmcRespiratoryEvent>();
            MachineSettings = new BmcMachineSettings();
        }
    }

    public class BmcMachineInfo
    {
        public string SerialNumber { get; set; }
        public string Model { get; set; }
    }

    public static class ClassExtensions
    {
        public static string ReadNullTerminatedString(this System.IO.BinaryReader stream)
        {
            string str = "";
            char ch;
            while ((int)(ch = stream.ReadChar()) != 0)
                str = str + ch;
            return str;
        }
    }

}



