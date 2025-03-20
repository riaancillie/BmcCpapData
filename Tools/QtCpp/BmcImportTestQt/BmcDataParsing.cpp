#include "BmcDataParsing.h"
#include <QDataStream>
#include <QFile>
#include <QDir>
#include <QBuffer>


QDateTime BmcEncodedDate::DecodeDate(quint16 encodedDate)
{
    int year = (encodedDate >> 9);
    year += 2000;
    int month = (encodedDate >> 5) & 0x0f;
    int day = encodedDate & 0x1f;
    return QDateTime(QDate(year, month, day), QTime(12, 0, 0));
}


BmcUsrSession::BmcUsrSession()
{

}

BmcUsrSession::BmcUsrSession(QDataStream* strm, bool InProgressSession) : BmcUsrSession()
{
    if (InProgressSession)
        this->ReadInProgressSession(strm);
    else
        this->ReadHistoricSession(strm);
}

void BmcUsrSession::ReadInProgressSession(QDataStream* strm)
{
    quint16 tmp16;
    strm->device()->seek(0x431);
    *strm >> tmp16;
    this->StartTimestamp = BmcEncodedDate::DecodeDate(tmp16);
    this->EndTimestamp = this->StartTimestamp.addDays(1);
    strm->device()->seek(0x441);

    while (true)
    {
        quint8 msgType;
        *strm >> msgType;

        if (msgType == 0xff) break;

        quint8 datalen = 3;

        if (msgType != 0x02)
        {
            *strm >> datalen;
        }

        char msgBytes[datalen];

        strm->readRawData(msgBytes, datalen);

        if (msgType == 0x07 || msgType == 0x08 || msgType == 0x09)
        {
            BmcRespiratoryEvent evt;
            switch (msgType){
                case 0x07: evt.EventType = BmcRespiratoryEventType::CSA; break;
                case 0x08: evt.EventType = BmcRespiratoryEventType::OSA; break;
                case 0x09: evt.EventType = BmcRespiratoryEventType::HYP; break;
            }

            evt.StartTime = this->StartTimestamp.addSecs(60 * 60 * msgBytes[0]).addSecs(60 * msgBytes[1]);
            evt.DurationSeconds = msgBytes[2];
            evt.EndTime = evt.StartTime.addSecs(evt.DurationSeconds);

            this->RespiratoryEvents.append(evt);

        }
    }
}

void BmcUsrSession::ReadHistoricSession(QDataStream* strm)
{
    quint32 tmp32;
    quint16 tmp16;
    quint8 b;

    *strm >> b;
    if (b != 0xE1)
        throw std::invalid_argument("BmcUsrSession: Session header error");

    strm->device()->seek(0x07);

    *strm >> tmp16;
    this->StartTimestamp = BmcEncodedDate::DecodeDate(tmp16);
    this->EndTimestamp = this->StartTimestamp.addDays(1);

    strm->device()->seek(0x0f);
    *strm >> tmp16;
    this->DurationMinutes = tmp16;


    strm->device()->seek(0x45);
    while (true)
    {
        *strm >> b;
        *strm >> tmp32;
        if (b == 0xff)
            break;

        MessageItem32 msg(b, tmp32);
        this->MessagesOffset45.append(msg);
    }

    tmp32 = strm->device()->pos();

    while (strm->device()->pos() < strm->device()->size())
    {
        quint8 msgType;
        quint16 count;
        *strm >> msgType;
        *strm >> count;
        *strm >> tmp16; //Discard next byte

        switch (msgType)
        {
            case 0x86:
            case 0x82:
            {
                for (int i = 0; i < count; i++)
                {
                    *strm >> tmp32;
                    MessageItem32 msg(msgType, tmp32);
                    this->DataMessages32.append(msg);
                }
                break;
            }

            case 0x83:
            case 0x84:
            case 0x87:
            {
                for (int i = 0; i < count; i++)
                {
                    quint8 b1, b2, b3;
                    *strm >> b1;
                    *strm >> b2;
                    *strm >> b3;
                    MessageItem24 msg(msgType, b1, b2, b3);
                    this->DataMessages24.append(msg);
                }
                break;
            }

            default:
            {
                for (int i = 0; i < count; i++)
                {
                    *strm >> tmp16;
                    MessageItem16 msg(msgType, tmp16);
                    this->DataMessages16.append(msg);
                }
                break;
            }
        }
    }

    for (auto &msg : this->DataMessages24)
    {
        BmcRespiratoryEvent evt;
        switch (msg.MessageType){
            case 0x83: evt.EventType = BmcRespiratoryEventType::OSA; break;
            case 0x84: evt.EventType = BmcRespiratoryEventType::HYP; break;
            case 0x87: evt.EventType = BmcRespiratoryEventType::CSA; break;
        }

        evt.StartTime = this->StartTimestamp.addSecs(60 * 60 * msg.Data1).addSecs(60 * msg.Data2);
        evt.DurationSeconds = msg.Data3;
        evt.EndTime = evt.StartTime.addSecs(evt.DurationSeconds);

        this->RespiratoryEvents.append(evt);
    }

}

quint32 BmcUsrSession::GetNextHistoricSessionOffset(QDataStream* strm)
{
    quint64 currentOffset = strm->device()->pos();
    strm->skipRawData(1);
    quint32 nextOffset;
    *strm >> nextOffset;
    strm->device()->seek(currentOffset);
    return nextOffset;
}


BmcIdxEntry::BmcIdxEntry()
{

}

BmcIdxEntry::BmcIdxEntry(QDataStream* strm) : BmcIdxEntry()
{
    quint16 header;
    *strm >> header; //0x000

    if (header != 0xAAAA)
        throw std::invalid_argument("IDX file header error");

    quint16 idx;
    *strm >> idx; //0x002

    quint8 year, month, day;
    *strm >> year >> month >> day;   //0x004,5,6

    Timestamp = QDateTime(QDate(year + 2000, month, day), QTime(0,0,0));

    strm->skipRawData(6); //0x007

    *strm >> this->StartOffsetPacket; //0x00d
    *strm >> this->StartFileIndex; //0x00f
    *strm >> this->NextOffsetPacket; //0x011
    *strm >> this->NextFileIndex; //0x013

    if (StartFileIndex > 29){
        throw std::invalid_argument("Invalid nnn waveform file index");
    }

    this->HasValidNext = this->NextFileIndex != 0xff;

    header++;

}

size_t BmcIdxEntry::StartOffsetByte()
{
    return this->StartOffsetPacket * 0x100;
}

QString BmcIdxEntry::StartFileExtension()
{
    return QString(".%1").arg(this->StartFileIndex, 3, 10, QLatin1Char('0'));
}

size_t BmcIdxEntry::NextOffsetByte()
{
    return this->NextOffsetPacket * 0x100;
}

QString BmcIdxEntry::NextFileExtension()
{
    return QString(".%1").arg(this->NextFileIndex, 3, 10, QLatin1Char('0'));
}



BmcMachineSettings::BmcMachineSettings()
{

}

BmcMachineSettings::BmcMachineSettings(QDataStream* strm) : BmcMachineSettings()
{
    if (strm->device()->size() < 0x200)
        throw std::invalid_argument("BmcMachineSettings: IDX packet is too short");

    quint16 header;
    *strm >> header; //0x000

    if (header != 0xAAAA)
        throw std::invalid_argument("BmcMachineSettings: IDX file header error");

    quint16 idx;
    *strm >> idx; //0x002

    quint8 year, month, day;
    *strm >> year >> month >> day;   //0x004,5,6

    Timestamp = QDate(year + 2000, month, day);

    strm->device()->seek(0x140);

    quint8 b;

    *strm >> b; //0x140
    this->APAP_IntialP = this->CPAP_InitialP = this->S_InitialEPAP = this->AutoS_InitialEPAP = (float)b / 2.0f;

    *strm >> b; //0x141
    this->CPAP_TreatP = this->APAP_MinAPAP = this->S_EPAP = this->AutoS_MinEPAP = (float)b / 2.0f;

    *strm >> this->RampTimeMinutes;  //142

    strm->skipRawData(1); //143

    *strm >> b; //0x144
    this->CPAP_ManualP = (float)b / 2.0f;

    *strm >> b; //145
    this->S_BackupRR = (b & 0x80) != 0;

    *strm >> this->HumidifierLevel; //146

    *strm >> b; //147
    this->LeakAlert = (b & 0x40) != 0;
    this->AutoOff = (b & 0x02) != 0;
    this->AutoOn = (b & 0x01) != 0;

    *strm >> b; //148
    this->Reslex= b & 0x03;
    float f = (float)(b >> 2) / 2.0f;
    this->S_IPAP = this->S_EPAP + f;
    this->AutoS_MinIPAP = this->AutoS_MinEPAP + f;

    *strm >> b; //149
    this->AutoS_ISENS = this->S_ISENS = 1 + (b & 0x07);
    this->AutoS_ESENS = this->S_ESENS = 1 + ((b >> 3) & 0x07);

    *strm >> b; //14a
    *strm >> b; //14b

    *strm >> b; //0x14c
    this->APAP_MaxAPAP = this->AutoS_MaxIPAP = (float)b / 2.0f;

    *strm >> b; //0x14d
    this->Mode = (BmcMode)(b >> 4);
    this->APAP_Sensitivity = b & 0x0f;

    *strm >> b; //14e

    *strm >> b; //14f
    this->AutoS_RiseTime = this->S_RiseTime = 1 + (b >> 6);

    *strm >> b; //150

    *strm >> b; //151
    this->ReslexPatient = (b & 0x80) != 0;

    *strm >> b; //152
    this->S_TiMin = (float)b / 10.0f;

    *strm >> b; //153
    this->S_TiMax = (float)b / 10.0f;

    strm->skipRawData(0x0c); //154 - 160

    *strm >> b; //160
    this->MaskType = (BmcMaskType)b;

    *strm >> b; //161

    *strm >> b; //162
    this->AirTubeType = (BmcAirTubeType)b;

    *strm >> b; //163

    *strm >> b; //164
    this->HeatedTubeLevel = b;

    *strm >> b; //165
    this->APAP_SmartA = (b & 0x02) != 0;
    this->CPAP_SmartC = (b & 0x01) != 0;
    this->AutoS_SmartB = (b & 0x04) != 0;

}

BmcWaveformPacket::BmcWaveformPacket(char* buffer)
{
    BmcWaveformPacketStruct* packetStruct = (BmcWaveformPacketStruct*)buffer;
    this->EPAP = packetStruct->EPAP / 2.0f;
    this->IPAP = packetStruct->IPAP / 2.0f;

    for (int i = 0; i < 25; i++)
    {
        this->Flow[i] = packetStruct->Flow[i] / 10.0f;
        this->PressureWave[i] = packetStruct->PressureWave[i];
        this->FlowAbnormality[i] = packetStruct->FlowAbnormality[i];
    }

    this->Leak = packetStruct->Leak / 10.f;
    this->TidalVolume = packetStruct->TidalVolume;
    this->MinuteVentilation = packetStruct->MinuteVentilation / 10.0f;
    this->RespiratoryRate = packetStruct->RespiratoryRate;
    this->IERatio = packetStruct->IERatio >= 0 && packetStruct->IERatio <= 100 ? IERatioLookup[packetStruct->IERatio] : 0;
    this->Timestamp = QDateTime(QDate(packetStruct->Year, packetStruct->Month, packetStruct->Day), QTime(packetStruct->Hour, packetStruct->Minute, packetStruct->Second));
}

QString BmcData::ChangeFileExtension(QString& path, QString newExtensionWithDot)
{
    QFileInfo finfo(path);
    QString newName = finfo.path() + QDir::separator() + finfo.completeBaseName() + newExtensionWithDot;
    return newName;
}

QString BmcData::GetUsrFilePath(QString& path)
{
    QDir dir(path);
    QStringList nameFilters;
    nameFilters << "*.USR";

    QString usrFile;

    auto usrFiles = dir.entryList(nameFilters);
    if (usrFiles.length() == 1){
        usrFile = path + usrFiles[0];
        return usrFile;
    } else {
        return nullptr;
    }
}

bool BmcData::DirectoryHasBmcData(QString& path)
{
    QDir dir(path);
    if (!dir.exists(path))
        throw std::invalid_argument("Path does not exist");

    if (!path.endsWith(QDir::separator()))
        path.append(QDir::separator());

    QString usrFile = GetUsrFilePath(path);
    if (usrFile == nullptr || !QFile::exists(usrFile)){
        return false;
    }

    if (!QFile::exists(ChangeFileExtension(usrFile, ".idx"))){
        return false;
    }

    if (!QFile::exists(ChangeFileExtension(usrFile, ".000"))){
        return false;
    }

    return true;

}



BmcData::BmcData() { }

BmcData::BmcData(QString& path) : BmcData()
{
    if (!path.endsWith(QDir::separator()))
        path.append(QDir::separator());

    this->dirPath = path;
    this->usrFilePath = GetUsrFilePath(path);
}

void BmcData::ReadIdxFile()
{
    QString idxPath = ChangeFileExtension(this->usrFilePath, ".idx");
    QFile file(idxPath);

    file.open(QIODevice::ReadOnly);

    file.seek(0x800);  //Packets start at offset 0x800

    //For each packet, we :
    //  * Read the 512 byte packet into memory
    //  * Read each packet for idx entry and machine settings
    //This results in less random-access seeking on a slow SD card

    while (file.pos() < file.size())
    {
        auto arr = file.read(512);
        QBuffer buf(&arr);
        buf.open(QIODevice::ReadOnly);
        QDataStream strmPacket(&buf);
        strmPacket.setByteOrder(QDataStream::LittleEndian);

        BmcIdxEntry entry(&strmPacket);
        this->AllIdxEntries.append(entry);

        //Go back to the start of the packet and read the machine settings in it
        buf.seek(0);
        BmcMachineSettings settings(&strmPacket);
        this->AllMachineSettings.append(settings);
    }

    file.close();
}

void BmcData::ReadAllSessions()
{
    QFile fileUSR(this->usrFilePath);
    fileUSR.open(QIODevice::ReadOnly);

    QDataStream strmUSR(&fileUSR);
    strmUSR.setByteOrder(QDataStream::LittleEndian);

    BmcUsrSession inProgressSession(&strmUSR, true);

    //The offset at which sessions begin
    fileUSR.seek(0x102340);

    //For each session, we determine the length of the session data, copy
    // the data to memory and then parse it from memory to save on file seeking.
    do
    {
        quint32 nextOffset = BmcUsrSession::GetNextHistoricSessionOffset(&strmUSR);
        quint32 len = nextOffset - fileUSR.pos();

        auto rawData = fileUSR.read(len);

        QBuffer buf(&rawData);
        buf.open(QIODevice::ReadOnly);
        QDataStream strmSession(&buf);
        strmSession.setByteOrder(QDataStream::LittleEndian);
        BmcUsrSession session(&strmSession, false);
        this->AllUsrSessions.append(session);

    }while (fileUSR.pos() < fileUSR.size());

    this->AllUsrSessions.append(inProgressSession);

    fileUSR.close();

}

QDateTime BmcData::ReadWaveformPacketTimestamp(QString& path, quint16 packetOffset)
{
    quint64 byteOffset = (packetOffset * 0x100) + 0xf8;

    if (!QFile::exists(path))
        return QDateTime();

    QFile file(path);

    if ((quint64)file.size() < byteOffset)
        return QDateTime();

    file.open(QIODevice::ReadOnly);
    if (!file.isOpen()){
        throw std::invalid_argument("Waveform file could be opened");
    }

    file.seek(byteOffset); //Offset in file of packet + offset of timestamp

    QDataStream strmPacket(&file);
    strmPacket.setByteOrder(QDataStream::LittleEndian);

    quint16 year;
    quint8 month, day, hour, minute, second;

    strmPacket >> year;
    strmPacket >> month;
    strmPacket >> day;
    strmPacket >> hour;
    strmPacket >> minute;
    strmPacket >> second;

    file.close();

    return QDateTime(QDate(year, month, day), QTime(hour, minute, second));
}

void BmcData::BuildWaveformCrumbs()
{
    int i = 0;
    QString extension = QString(".%1").arg(i, 3, 10, QLatin1Char('0'));
    QString filepath = ChangeFileExtension(this->usrFilePath, extension);

    while (QFile::exists(filepath))
    {
        QString idxPath = ChangeFileExtension(this->usrFilePath, ".idx");

        for (int j = 0; j < 16; j++)
        {
            quint16 packetOffset = i * 0x1000;
            quint64 byteOffset = packetOffset * 0x100;
            QDateTime timestamp = ReadWaveformPacketTimestamp(filepath, packetOffset);
            if (!timestamp.isNull()){
                BmcWaveformCrumb crumb;
                crumb.Filepath = filepath;
                crumb.FileIndex = i;
                crumb.PacketOffset = packetOffset;
                crumb.ByteOffset = byteOffset;
                crumb.Timestamp = timestamp;
                this->WaveformCrumbs.append(crumb);
            }
        }

        i++;
        extension = QString(".%1").arg(i, 3, 10, QLatin1Char('0'));
        filepath = ChangeFileExtension(this->usrFilePath, extension);
    };


    std::sort(this->WaveformCrumbs.begin(), this->WaveformCrumbs.end(), [](BmcWaveformCrumb a, BmcWaveformCrumb b)->bool{
        return a.Timestamp < b.Timestamp;
    });

}

void BmcData::FindValidSessions()
{
    //Since .nnn waveform data is overwritten cyclicly, we need to check
    //whether the packet the IDX entry points to in .nnn matches the date
    //of the idx entry. If not, we found the point where the data overwrite
    //tail is.

    QListIterator<BmcIdxEntry> itr(this->AllIdxEntries);
    itr.toBack();

    while (itr.hasPrevious())
    {
        BmcIdxEntry entry = itr.previous();
        QString startPath = ChangeFileExtension(this->usrFilePath, entry.StartFileExtension());
        QString nextPath = ChangeFileExtension(this->usrFilePath, entry.NextFileExtension());

        entry.StartWaveformPacketTimestamp = ReadWaveformPacketTimestamp(startPath, entry.StartOffsetPacket);


        auto daysDifference =  qAbs(entry.Timestamp.daysTo(entry.StartWaveformPacketTimestamp));

        if (daysDifference >= 3)
            break;

        this->ValidIdxEntries.insert(0, entry);
    }

    //Next we iterate all the USR sessions and see if there is a valid IDX session

    for (auto &usrSession : this->AllUsrSessions)
    {
        BmcIdxEntry* foundIdxEntry = nullptr;

        for (auto &idxEntry : this->ValidIdxEntries)
        {
            if (usrSession.StartTimestamp >= idxEntry.StartWaveformPacketTimestamp)
                foundIdxEntry = &idxEntry;
            else
                break;
        }

        if (foundIdxEntry != NULL){
            BmcDataLink link;
            link.IdxEntry = *foundIdxEntry;
            link.UsrSession = usrSession;

            for (auto &crumb : this->WaveformCrumbs){
                if (crumb.Timestamp < usrSession.StartTimestamp)
                    link.WaveformCrumb = crumb;
                else
                    break;
            }

            this->SessionLinks.append(link);
        }
    }

}

int BmcData::ReadDataCount()
{
    QFile file(this->usrFilePath);
    file.open(QIODevice::ReadOnly);

    file.seek(0x102338);  //Packets start at offset 0x800

    char countBuf[2];
    file.read(countBuf,2);

    file.close();

    uint16_t* count = (uint16_t*)countBuf;
    return *count;
}

void BmcData::ReadData()
{
    this->ReadIdxFile();
    this->ReadAllSessions();
    this->BuildWaveformCrumbs();
    this->FindValidSessions();
}

QList<BmcWaveformPacket> BmcData::ReadWaveforms(BmcDataLink& link)
{
    QList<BmcWaveformPacket> waveforms;

    if (!QFile::exists(link.WaveformCrumb.Filepath))
        return waveforms;

    char packetBuf[256];

    int currentFileIndex = link.WaveformCrumb.FileIndex;
    QFile* nnnFile = new QFile(link.WaveformCrumb.Filepath);
    nnnFile->open(QIODevice::ReadOnly);
    nnnFile->seek(link.WaveformCrumb.ByteOffset);

    bool complete = false;

    while (!complete)
    {
        while (nnnFile->pos() < nnnFile->size())
        {
            nnnFile->read(packetBuf, 0x100);

            BmcWaveformPacket packet(packetBuf);

            if (packet.Timestamp >= link.UsrSession.StartTimestamp && packet.Timestamp <= link.UsrSession.EndTimestamp)
                waveforms.append(packet);

            if (packet.Timestamp > link.UsrSession.EndTimestamp){
                complete = true;
                break;
            }
        }
        nnnFile->close();

        currentFileIndex++;
        QString nextExtension = QString(".%1").arg(currentFileIndex, 3, 10, QLatin1Char('0'));
        QString nextPath = ChangeFileExtension(this->usrFilePath, nextExtension);

        if (!QFile::exists(nextPath)){
            currentFileIndex = 0;
            nextExtension = QString(".%1").arg(currentFileIndex, 3, 10, QLatin1Char('0'));
            nextPath = ChangeFileExtension(this->usrFilePath, nextExtension);
        }

        delete(nnnFile);
        nnnFile = new QFile(nextPath);
        nnnFile->open(QIODevice::ReadOnly);
    }

    return waveforms;

}


BmcDateSession BmcData::ReadSession(QDate aDate)
{
    BmcDataLink* foundLink = NULL;
    for (auto &link: this->SessionLinks)
    {
        if (link.UsrSession.StartTimestamp.date() == aDate)
        {
            foundLink = &link;
            break;
        }
    }

    BmcDateSession session;
    session.StartTime = foundLink->UsrSession.StartTimestamp;
    session.DurationMinutes = foundLink->UsrSession.DurationMinutes;
    session.MachineInfo = ReadMachineInfo();
    session.RespiratoryEvents = foundLink->UsrSession.RespiratoryEvents;
    session.Waveforms = ReadWaveforms(*foundLink);

    BmcMachineSettings* foundSettings = NULL;
    for (auto &msettings : this->AllMachineSettings)
    {
        if (msettings.Timestamp > foundLink->UsrSession.StartTimestamp.date())
        {
            foundSettings = &msettings;
            break;
        }
    }
    if (foundSettings == NULL)
        foundSettings = &(AllMachineSettings.last());

    session.MacineSettings = *foundSettings;

    return session;
}

BmcMachineInfo BmcData::ReadMachineInfo()
{
   BmcMachineInfo info;

   QFile usrFile(this->usrFilePath);
   usrFile.open(QIODevice::ReadOnly);

   char buf[32];

   //SerialNumber
   usrFile.seek(0x2d);
   usrFile.read(buf, 32);
   info.SerialNumber = QString(buf);
   //info.SerialNumber.truncate(info.SerialNumber.indexOf(QChar::Null));
   info.SerialNumber = info.SerialNumber.trimmed();

   //Model Number
   usrFile.seek(0x2296);
   usrFile.read(buf, 32);
   info.Model = QString(buf);
   //info.Model.truncate(info.Model.indexOf(QChar::Null));
   info.Model = info.Model.trimmed();

   usrFile.close();

   return info;
}
