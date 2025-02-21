using BmcCpapFileParser;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
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
            var pathusr = $"T:\\CPAP\\BMC G3 SD Card\\{folder}\\24C36003.USR";
            var startTime = DateTime.Parse("2025/02/20 20:00:00");
            var endTime = DateTime.Parse("2025/02/21 07:00:00");


            List<BmcSession> sessions = new List<BmcSession>();

            List<BmcPacket> packets = new List<BmcPacket>();

            var nnnFile = 0;

            while (true)
            {
                var extension = nnnFile.ToString("000");
                var pathnnn = Path.ChangeExtension(pathusr, extension);

                if (!File.Exists(pathnnn))
                    break;

                nnnFile++;

                var bytes = System.IO.File.ReadAllBytes(pathnnn);

                var ms = new MemoryStream(bytes);
                var c = new BinaryReader(ms);

                while (ms.Position != ms.Length)
                {
                    var packet = new BmcPacket(c);
                    if (packet.Flow.Any(x => x > 5000))
                    {

                    }
                    packets.Add(packet);
                }

            }
            var pk = packets.FirstOrDefault(x => x.Timestamp > DateTime.Parse("2025/02/15 12:00:00"));
            var idx = packets.IndexOf(pk);
            var offset = idx * 256;

            var result = "";

            var packetStart = packets.FindIndex(x => x.Timestamp >= DateTime.Parse("2025/02/15 01:33:55"));

            var data = packets.Skip(packetStart).Take(60);

            var csv = new BmcCsvList(data);



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


            //var result = JsonConvert.SerializeObject(packets, Formatting.Indented);
            //Console.WriteLine(result);

            var termsNot4 = packets.GroupBy(x => x.Terminator).ToList();
            var termsUnique = packets.Select(x => x.Terminator).ToList().Distinct().ToList();


            //packetStart = packets.FindIndex(x => x.Timestamp >= DateTime.Parse("2025/02/15 00:01:00"));
            data = packets
                .SkipWhile(x => x.Timestamp <= startTime)
                .TakeWhile(x => x.Timestamp <= endTime);

            

            sessions.AddRange(ReadUsrFileLatest(pathusr));
            sessions.AddRange(ReadUsrFileSessions(pathusr));

            var allRespEvents = sessions.Select(x => x.RespiratoryEvents).SelectMany(x => x);
            var allRespEventsForThisSession = allRespEvents.Where(x => x.Start >= startTime && x.End <= endTime);

            var groupedEvents = allRespEventsForThisSession.GroupBy(x => x.EventType).ToDictionary(x => x.Key, g => g.Select(x => new { StartTimestamp = x.Start, Duration = x.DurationSeconds }));

            var jsonData = new
            {
                Name = startTime.ToString("yyyy/MM/dd HH:mm:ss") + " - " + endTime.ToString("HH:mm:ss"),
                Events = groupedEvents,
                Packets = data
            };

            var json = JsonConvert.SerializeObject(jsonData, Formatting.Indented);
            System.IO.File.WriteAllText($"t:\\CPAP\\{startTime.ToString("yyyyMMdd")}.json", json);

        }

        public static IEnumerable<BmcSession> ReadUsrFileSessions(string aPath)
        {
            var sessions = new List<BmcSession>();
            
            var strm = System.IO.File.OpenRead(aPath);            
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
                var session = new BmcSession();
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
                        else if (msgType == 0x84 || msgType == 0x83 ||  msgType == 0x85)
                        {
                            b.Read(tmpBuffer, 0, 3);


                            var evt = new BmcRespiratoryEvent(msgType, tmpBuffer, sessionDate);
                            session.RespiratoryEvents.Add(evt);
                        }
                        else
                        {
                            var dt = b.ReadInt16();
                        }
                        
                    }

                    if (strm.Position == strm.Length || PeekByte(strm) == 0xE1)
                        break;
                }

                if (strm.Position  == strm.Length)
                    break;

            }

            return sessions;
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



        public static IEnumerable<BmcSession> ReadUsrFileLatest(string aPath)
        {
            BmcSession session = new BmcSession();
            
            var items = new List<BmcTodaySessionDataItem>();
            var strm = System.IO.File.OpenRead(aPath);
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

            var str = JsonConvert.SerializeObject(items, Formatting.Indented);

            return new BmcSession[] { session };
            
        }
    }

    public class BmcPacket
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

        public BmcPacket()
        {
            Unknown1 = new List<int>();
            Unknown2 = new List<int>();
            Unknown3 = new List<int>();
            Unknown4Ints = new List<int>();
            Unknown5Ints = new List<int>();
            Unknown6Ints = new List<int>();
            this.Flow = new List<float>();
        }

        public BmcPacket(BinaryReader aReader) : this()
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

        public BmcCsvList(IEnumerable<BmcPacket> aData)
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
                case 0x85: this.EventType = "CSA"; break;
                default: this.EventType = "UNKNOWN"; break;
            }
        }

        

    }

    public class BmcSession
    {
        public DateTime StartTime { get; set; }
        public TimeSpan Duration { get; set; }

        public List<BmcRespiratoryEvent> RespiratoryEvents { get; set; } = new List<BmcRespiratoryEvent>();
    }
}



