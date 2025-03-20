#include <QCoreApplication>
#include <QTextStream>
#include "QDebug"
#include <QFile>
#include <QDataStream>
#include <QDateTime>
#include <QDate>
#include <QTime>
#include <QByteArray>
#include <QBuffer>

#include "BmcDataParsing.h"

QTextStream qout(stdout);

QDateTime decodeUint16Date(quint16 aDateEncoded)
{
    int year = (aDateEncoded >> 9) + 2000;
    int month = (aDateEncoded >> 5) & 0x0f;
    int day = aDateEncoded & 0x1f;
    QDateTime dt(QDate(year, month, day), QTime(12, 0, 0));
    return dt;
}

int main(int argc, char *argv[])
{
    qout << "Hello, world!" << endl;
    qout.flush();

    //QString path = "T:\\CPAP\\BMC G3 SD Card\\2025-02-21\\";
    QString path = "T:\\CPAP\\Other\\bipap";

    if (!BmcData::DirectoryHasBmcData(path))
        throw std::invalid_argument("Path does not contain BMC data.");

    BmcData data(path);
    auto dataCount = data.ReadDataCount();
    qout << "Data Count: " << dataCount << "\n";
    qout.flush();
    data.ReadData();
    //auto session = data.ReadSession(QDate(2024, 07, 04));




    qout << data.AllUsrSessions.length() << "\n";
    qout.flush();

/*    QFile file("T:\\CPAP\\BMC G3 SD Card\\2025-02-21\\24C36003.idx");
    file.open(QIODevice::ReadOnly);

    QDataStream strm(&file);
    strm.setByteOrder(QDataStream::LittleEndian);
    file.seek(0x800);


    while (file.pos() < file.size())
    {
        auto arr = file.read(512);
        QBuffer buf(&arr);
        buf.open(QIODevice::ReadOnly);
        QDataStream strm2(&buf);
        strm2.setByteOrder(QDataStream::LittleEndian);
        BmcIdxEntry entry(&strm2);

        buf.seek(0);
        BmcMachineSettings settings(&strm2);
    }

    file.close();

    QList<BmcUsrSession> sessions;

    QFile file000("T:\\CPAP\\BMC G3 SD Card\\2025-02-21\\24C36003.000");
    char tmpBuf[256];
    file000.open(QIODevice::ReadOnly);
    file000.seek(0x800);
    while (file000.pos() < file000.size())
    {
        file000.read(tmpBuf, 256);
        BmcWaveformPacketStruct* packet = (BmcWaveformPacketStruct*)tmpBuf;
        qout << file000.pos();
    }
    file000.close();


    QFile fileUSR("T:\\CPAP\\BMC G3 SD Card\\2025-02-21\\24C36003.USR");
    fileUSR.open(QIODevice::ReadOnly);

    QDataStream strmUSR(&fileUSR);
    strmUSR.setByteOrder(QDataStream::LittleEndian);

    BmcUsrSession inProgressSession(&strmUSR, true);

    fileUSR.seek(0x102340);

    do
    {
        quint32 nextOffset = BmcUsrSession::GetNextHistoricSessionOffset(&strmUSR);
        quint32 len = nextOffset - fileUSR.pos();

        auto rawData = fileUSR.read(len);

        QBuffer buf(&rawData);
        buf.open(QIODevice::ReadOnly);
        QDataStream strm2(&buf);
        strm2.setByteOrder(QDataStream::LittleEndian);
        BmcUsrSession session(&strm2, false);
        sessions.append(session);

    }while (fileUSR.pos() < fileUSR.size());

    sessions.append(inProgressSession);

    fileUSR.close();

*/
}
