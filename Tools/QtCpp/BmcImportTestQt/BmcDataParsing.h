#ifndef BMCDATAPARSING_H
#define BMCDATAPARSING_H

#include <QDate>
#include <QDataStream>
#include <QList>

const static float IERatioLookup[] = {
        0, 9.1, 16.7, 23.1, 28.6, 33.3, 37.5, 41.2, 44.4, 47.4, 50, 52.4, 54.5, 56.5, 58.3,
        60, 61.5, 63, 64.3, 65.5, 66.7, 67.7, 68.8, 69.7, 70.6, 71.4, 72.2, 73, 73.7, 74.4, 75, 75.6, 76.2,
        76.7, 77.3, 77.8, 78.3, 78.7, 79.2, 79.6, 80, 80.4, 80.8, 81.1, 81.5, 81.8, 82.1, 82.5, 82.8, 83.1,
        83.3, 83.6, 83.9, 84.1, 84.4, 84.6, 84.8, 85.1, 85.3, 85.5, 85.7, 85.9, 86.1, 86.3, 86.5, 86.7,
        86.8, 87, 87.2, 87.3, 87.5, 87.7, 87.8, 88, 88.1, 88.2, 88.4, 88.5, 88.6, 88.8, 88.9, 89, 89.1, 89.2,
        89.4, 89.5, 89.6, 89.7, 89.8, 89.9, 90, 90.1, 90.2, 90.3, 90.4, 90.5, 90.6, 90.7, 90.7, 90.8
        };

class MessageItemBase {};

class MessageItem32 : public MessageItemBase
{
public:
    int MessageType;
    quint32 Data;

    MessageItem32(int msgType, quint32 data) : MessageType(msgType), Data(data) {};
};

class MessageItem24 : public MessageItemBase
{
public:
    int MessageType;
    quint8 Data1;
    quint8 Data2;
    quint8 Data3;

    MessageItem24(int msgType, quint16 data1, quint8 data2, quint8 data3) :
        MessageType(msgType),
        Data1(data1),
        Data2(data2),
        Data3(data3)
        {};
};

class MessageItem16 : public MessageItemBase
{
public:
    int MessageType;
    quint16 Data;

    MessageItem16(int msgType, quint16 data) : MessageType(msgType), Data(data) {};
};

class BmcEncodedDate{
public:
    static QDateTime DecodeDate(quint16);
};

enum BmcRespiratoryEventType
{
    HYP = 0,
    OSA,
    CSA,
    Unknown
};

class BmcRespiratoryEvent
{
public:
    BmcRespiratoryEventType EventType;
    QDateTime StartTime;
    QDateTime EndTime;
    int DurationSeconds;
};

class BmcUsrSession
{
public:
    QDateTime StartTimestamp;
    QDateTime EndTimestamp;
    int DurationMinutes;
    QList<BmcRespiratoryEvent> RespiratoryEvents;

    BmcUsrSession();
    BmcUsrSession(QDataStream*, bool inProgressSession);

    static quint32 GetNextHistoricSessionOffset(QDataStream*);

protected:
    QList<MessageItem32> MessagesOffset45;
    QList<MessageItem32> DataMessages32;
    QList<MessageItem24> DataMessages24;
    QList<MessageItem16> DataMessages16;

    void ReadInProgressSession(QDataStream*);
    void ReadHistoricSession(QDataStream*);
};

class BmcIdxEntry{
public:
    QDateTime Timestamp;
    int Index;
    quint16 StartOffsetPacket;
    quint8 StartFileIndex;
    quint16 NextOffsetPacket;
    bool HasValidNext;
    quint8 NextFileIndex;

    QDateTime StartWaveformPacketTimestamp;

    size_t StartOffsetByte();
    QString StartFileExtension();
    size_t NextOffsetByte();
    QString NextFileExtension();

    BmcIdxEntry();
    BmcIdxEntry(QDataStream*);
};

enum BmcMode
{
    CPAP = 0,
    AutoCPAP,
    S,
    ST,
    T,
    Titration,
    AutoS
};

enum BmcMaskType
{
    FullFace = 0,
    Nasal,
    NasalPillow,
    Other
};

enum BmcAirTubeType
{
    Unheated22mm = 0,
    Unheated15mm,
    Heated22mm,
    Heated15mm
};

class BmcMachineSettings
{
public:
    QDate Timestamp;

    quint8 Reslex;
    bool ReslexPatient;

    quint8 RampTimeMinutes;

    quint8 HumidifierLevel;

    float APAP_IntialP;
    float APAP_MinAPAP;
    float APAP_MaxAPAP;
    quint8 APAP_Sensitivity;
    bool APAP_SmartA;


    float CPAP_InitialP;
    float CPAP_TreatP;
    float CPAP_ManualP;
    bool CPAP_SmartC;


    float S_InitialEPAP;
    float S_EPAP;
    float S_IPAP;
    int S_ISENS;
    float S_ESENS;
    quint8 S_RiseTime;
    float S_TiMin;
    float S_TiMax;
    bool S_BackupRR;

    float AutoS_InitialEPAP;
    float AutoS_MinEPAP;
    float AutoS_MinIPAP;
    float AutoS_MaxIPAP;

    int AutoS_ISENS;
    float AutoS_ESENS;
    quint8 AutoS_RiseTime;

    bool AutoS_SmartB;



    bool LeakAlert;
    bool AutoOn;
    bool AutoOff;

    BmcMode Mode;

    BmcMaskType MaskType;
    BmcAirTubeType AirTubeType;
    int HeatedTubeLevel;

    BmcMachineSettings();
    BmcMachineSettings(QDataStream*);
};

class BmcWaveformCrumb
{
public:
    QString Filepath;
    quint16 FileIndex;
    quint64 ByteOffset;
    quint16 PacketOffset;
    QDateTime Timestamp;
};

class BmcDataLink
{
public:
    BmcUsrSession UsrSession;
    BmcIdxEntry IdxEntry;
    BmcWaveformCrumb WaveformCrumb;
};

#pragma pack(push, 1)
struct BmcWaveformPacketStruct{
    uint16_t Header; //00
    uint16_t Offset0x02; //02
    uint16_t IPAP; //04
    uint16_t EPAP; //06
    uint16_t PressureWave[25]; //08
    uint16_t FlowAbnormality[25]; //3a
    uint16_t Flow[25]; //6c
    uint16_t Offset0x9E;
    uint16_t Offset0xA0;
    uint16_t Offset0xA2;
    uint16_t Offset0xA4;
    uint16_t Offset0xA6;
    uint16_t Offset0xA8;
    uint16_t Offset0xAA;
    uint16_t Offset0xAC;
    uint16_t Offset0xAE;
    uint16_t Offset0xB0;
    uint16_t Offset0xB2;
    uint16_t Offset0xB4;
    uint16_t Offset0xB6;
    uint16_t Offset0xB8;
    uint16_t Offset0xBA;
    uint16_t Offset0xBC;
    uint16_t Offset0xBE;
    uint16_t Offset0xC0;
    uint16_t Offset0xC2;
    uint16_t Leak; //C4
    uint16_t TidalVolume; //C6
    uint16_t Offset0xC8;
    uint16_t MinuteVentilation; //CA
    uint16_t Offset0xCC;
    uint16_t Offset0xCE;
    uint16_t RespiratoryRate; //D0
    uint16_t IERatio; //D2
    uint16_t Offset0xD4;
    uint16_t Offset0xD6;
    uint16_t Offset0xD8;
    uint16_t Offset0xDA;
    uint16_t Offset0xDC;
    uint16_t Offset0xDE;
    uint16_t Offset0xE0;
    uint16_t Offset0xE2;
    uint16_t Offset0xE4;
    uint16_t Offset0xE6;
    uint16_t Offset0xE8;
    uint16_t Offset0xEA;
    uint16_t Offset0xEC;
    uint16_t Offset0xEE;
    uint16_t Offset0xF0;
    uint16_t Offset0xF2;
    uint16_t Offset0xF4;
    uint16_t Offset0xF6;
    uint16_t Year; //F8
    uint8_t Month; //FA
    uint8_t Day;  //FB
    uint8_t Hour;  //FC
    uint8_t Minute;  //FD
    uint8_t Second;  //FE
    uint8_t Terminator;
};
#pragma pack(pop)

class BmcWaveformPacket
{
public:
    QDateTime Timestamp;
    float IPAP;
    float EPAP;
    quint16 PressureWave[25];
    quint16 FlowAbnormality[25];
    float Flow[25];
    float Leak;
    int TidalVolume;
    float MinuteVentilation;
    quint16 RespiratoryRate;
    float IERatio;

    BmcWaveformPacket(char* buffer);
};

class BmcMachineInfo
{
public:
    QString SerialNumber;
    QString Model;
};

class BmcDateSession
{
public:
    QDateTime StartTime;
    int DurationMinutes;
    BmcMachineInfo MachineInfo;
    BmcMachineSettings MacineSettings;
    QList<BmcRespiratoryEvent> RespiratoryEvents;
    QList<BmcWaveformPacket> Waveforms;
};

class BmcData
{
public:
    QList<BmcUsrSession> AllUsrSessions;
    QList<BmcMachineSettings> AllMachineSettings;
    QList<BmcIdxEntry> AllIdxEntries;

    QList<BmcIdxEntry> ValidIdxEntries;

    QList<BmcDataLink> SessionLinks;

    QList<BmcWaveformCrumb> WaveformCrumbs;

    static bool DirectoryHasBmcData(const QString& path);

    BmcData();
    BmcData(QString& path);

    int ReadDataCount();
    void ReadData();

    BmcMachineInfo ReadMachineInfo();
    
    BmcDateSession ReadSession(QDate aDate);



protected:
    QString dirPath;
    QString usrFilePath;

    static QString ChangeFileExtension(QString& path, QString newExtensionWithDot);
    static QString GetUsrFilePath(QString& path);

    QDateTime ReadWaveformPacketTimestamp(QString& path, quint16 packetOffset);

    void ReadIdxFile();
    void ReadAllSessions();
    void BuildWaveformCrumbs();
    QList<BmcWaveformPacket> ReadWaveforms(BmcDataLink & link);
    void FindValidSessions();
};


#endif // BMCDATAPARSING_H
