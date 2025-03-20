var jsonData = null;
let graphs = [];
let graphAHI = null;
let timeline = null;

let dateFormat = "YYYY/MM/DD";
let timeFormat = "HH:mm:ss";
let timeFormatChart = "HH:mm:ss.fff";

const  ChannelTypeData = 1;
const  ChannelTypeSetting = 2;
const  ChannelTypeFlag = 4;
const  ChannelTypeMinorFlag = 8;
const  ChannelTypeSpan = 16;
const  ChannelTypeWaveform = 32;
const  ChannelTypeUnknown = 64;

const AHI_CHANNELS = ["ClearAirway", "AllApea", "Obstructive", "Hypopnea", "Apnea"];
const FLAG_COLORS = {
    OA: ["#8f271f", "#e03c2f"],
    H: ["#77852c", "#d4ed47"],
    CA: ["#377d8c", "#41c3e0"],
    LL: ["#7a8182", "#d5e0e3"],
    CSR: ["#421163", "#a033e8"],
}

const UnknownFlagColors = [
    ["#871c60", "#e31e9b"],
    ["#8f7014", "#d1a215"],
    ["#0c8710", "#1ad920"],
    ["#2c1178", "#5125cc"]
];
var unknownColorIndex = 0;

function setDateFormat(formatStr){
    dateFormat = formatStr;
    localStorage.setItem("dateFormat", dateFormat);
    onUpdateDatetimeFormats();
}

function setTimeFormat(formatStr){
    timeFormat = formatStr;
    timeFormatChart = formatStr.replace(":ss", ":ss.fff").replace("A", "TT");
    localStorage.setItem("timeFormat", timeFormat);
    localStorage.setItem("timeFormatChart", timeFormatChart);
    onUpdateDatetimeFormats();
}

function restoreSettings()
{
    dateFormat = localStorage.getItem("dateFormat") ?? dateFormat;
    timeFormat = localStorage.getItem("timeFormat") ?? timeFormat;
    timeFormatChart = localStorage.getItem("timeFormatChart") ?? timeFormatChart;
}

function onUpdateDatetimeFormats(){
    displayMachineSettings(jsonData);
    displaySessions(jsonData);
    graphs.forEach(g => {
        g.chart.options.axisX.crosshair.valueFormatString = timeFormatChart.replace("A", "TT");
        g.chart.options.axisX.valueFormatString = timeFormat.replace("A", "TT");
        g.chart.options.data.forEach(d => {d.xValueFormatString = `${dateFormat} ${timeFormatChart}`});
        g.chart.render();
    })
}

async function onChangeSessions()
{
    $("#pnlLoading").show();
    graphs.forEach(g => { g.chart.destroy(); });
    graphs = [];

    $("#pnlGraphs").empty();

    this.onCrosshairHidden = null;
    this.onCrosshairUpdated = null;
    this.onRangeChanged = null;
    this.onToolTipHidden = null;
    this.onToolTipUpdated = null;

    await makeWaveformCharts(jsonData);
    displayStatistics(jsonData);
    await displayTimeline(jsonData);

    $("#pnlLoading").hide();
}

async function getDataJson(url) {
    let result = await fetch(url);
    let gzArrayBuf = await result.arrayBuffer();
    let gzBytes = new Uint8Array(gzArrayBuf);
    let jsonBytes = fflate.decompressSync(gzBytes);
    let jsonStr = new TextDecoder().decode(jsonBytes);
    let json = JSON.parse(jsonStr);
    return json;
}

function displaySessions(data){
    $("#tblSessions").empty();
    for (let session of data.Sessions){
        let row = $("<tr></tr>");
        let cellCheck = $(`<td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" checked></td>`);
        if (!session.Enabled){ $(cellCheck).removeAttr("checked"); }

        momentStart = moment(session.SessionStart);
        momentEnd = moment(session.SessionEnd);
        duration = moment.duration(momentEnd.diff(momentStart));

        let cellStart = $(`<td></td>`).text(momentStart.format(`${dateFormat} ${timeFormat}`));
        let cellEnd = $(`<td></td>`).text(momentEnd.format(`${dateFormat} ${timeFormat}`));
        let cellDuration = $(`<td></td>`).text(`${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`)

        $(row).append([cellCheck, cellStart, cellEnd, cellDuration]);

        $("input", cellCheck).on("change", () => { session.Enabled = $("input", cellCheck).prop("checked"); onChangeSessions(); });

        $("#tblSessions").append(row);
    }
}

function displayMachineSettings(data) {
    let machineSettings = data.Sessions[0].MachineSettings;

    $("#txtMachineBrand").text(data.Sessions[0].MachineBrand);
    $("#txtMachineModel").text(data.Sessions[0].MachineModel);

    $("#tblMachineSettings").empty();

    let sortedSettings = machineSettings.sort((a, b) => { return a.Label.localeCompare(b.Label) });

    for (let setting of sortedSettings) {
        let row = $(`<tr></tr>`);
        let cellLabel = $(`<td></td>`).text(setting.Label);
        let cellValue = $(`<td></td>`).text(setting.Value);
        $(row).append([cellLabel, cellValue]);
        $("#tblMachineSettings").append(row);
    }
}


function displayStatistics(data)
{

    $("#pnlLoadingText").text("Gathering Statistics...");

    $("#tblStats").empty();

    const statsChannels = ["Pressure", "PressureSet", "EPAP", "EPAPSet", "IPAP", "IPAPSet",
        "PS", "PTB", "PRS1PeakFlow", "Prisma_ObstructLevel", "Prisma_PressureMeasured", "Prisma_rRMV", "Prisma_rMVFluctuation",
        "MinuteVent", "RespRate", "RespEvent", "FLG",
        "Leak", "LeakTotal", "Snore", "IE", "Ti", "Te", "TgMV",
         "TidalVolume", "Pulse", "SPO2", "Inclination", "Orientation", "Motion"

    ];

    let stats = [];

    for (let statsChannelCode of statsChannels)
    {
        let channelName = "";
        let channelUnit = "";

        let channelData = [];
        for (let session of data.Sessions){
            if (!session.Enabled) continue;

            let channel = session.Channels.find(x => x.Code == statsChannelCode);

            if (channel == null) continue;

            channelName = channel.Name;
            channelUnit = channel.Units;

            channelData = channelData.concat(channel.Data);
        }

        if (channelData.length == 0) continue;

        stats.push({
            ChannelCode: statsChannelCode,
            ChannelName: channelName,
            ChannelUnit: channelUnit,
            Min: calcMin(channelData),
            Max: calcMax(channelData),
            Median: calcMedian(channelData),
            Percent95: calcQuartile(channelData, 95),
            Percent995: calcQuartile(channelData, 99.5),
        });
    }

    console.log(stats);

    for (let stat of stats) {
        let row = $(`<tr></tr>`);
        let cellChannel = $(`<td></td>`).text(stat.ChannelName);
        let cellMin = $(`<td></td>`).text(stat.Min.toFixed(2));
        let cellMed = $(`<td></td>`).text(stat.Median.toFixed(2));
        let cell95 = $(`<td></td>`).text(stat.Percent95.toFixed(2));
        let cell995 = $(`<td></td>`).text(stat.Percent995.toFixed(2));
        let cellMax = $(`<td></td>`).text(stat.Max.toFixed(2));
        let cellUnits = $(`<td></td>`).text(stat.ChannelUnit);
        $(row).append([cellChannel, cellMin, cellMed, cell95, cell995, cellMax, cellUnits]);
        $("#tblStats").append(row);
    }



    //Calculate AHI
    let ahiChannels = [];
    let totalSleepSeconds = 0;
    for (let session of data.Sessions)
    {
        if (!session.Enabled) continue;

        totalSleepSeconds += ((session.SessionEnd - session.SessionStart) / 1000);

        for (let respType of AHI_CHANNELS)
        {
            let sessionChannel = session.Channels.find(x => x.Code == respType)
            if (sessionChannel ==  null) continue;

            for (let respEventDuration of sessionChannel.Data)
            {
                let ahiChannel = ahiChannels.find(x => x.Code == respType);
                if (ahiChannel == null){
                    ahiChannel = {
                        Code: respType,
                        Duration: 0,
                        Count: 0
                    }
                    ahiChannels.push(ahiChannel);
                }

                ahiChannel.Duration += respEventDuration;
                ahiChannel.Count++;
            }
        }
    }

    let totalSleepHours = totalSleepSeconds / (60 * 60);

    for (let ahiChannel of ahiChannels){
        ahiChannel.TimeRatio = ahiChannel.Duration / totalSleepSeconds
        ahiChannel.TimePercentage = ahiChannel.TimeRatio * 100;
        ahiChannel.Index = ahiChannel.Count / totalSleepHours;
    }

    totalAhi = 0;
    ahiChannels.forEach(x => totalAhi += x.Index);

    console.log("Total sleep: ", totalSleepSeconds);
    console.table(ahiChannels);

    $("#lblAHIValue").text(totalAhi.toFixed(2));

    if (graphAHI) graphAHI.destroy();

    let dataPoints = [];
    for (let ahiChannel of ahiChannels){
        let shortCode = ahiChannel.Code;
        switch (ahiChannel.Code)
        {
            case "Obstructive": shortCode = "OA"; break;
            case "ClearAirway": shortCode = "CSA"; break;
            case "Hypopnea": shortCode = "H"; break;
            case "AllApnea": shortCode = "AA"; break;
            case "lApnea": shortCode = "A"; break;
        }
        dataPoints.push({y: ahiChannel.Index.toFixed(2), label: ahiChannel.Code, shortCode: shortCode})
    }

    graphAHI = new CanvasJS.Chart("chtAHI", {
        animationEnabled: true,
        backgroundColor: null,
        title:{            },
        toolTip: {
            fontFamily: 'Poppins',
            cornerRadius: 5,
        },

        data: [{
            type: "doughnut",
            indexLabelFontColor: "#ffffff",
            indexLabelFontFamily: 'Poppins',
            indexLabelFontSize: 15,
            startAngle: 60,
            indexLabel: "{shortCode}",
            toolTipContent: "<b>{label}:</b> {y}",
            dataPoints: dataPoints
        }]
    });
    graphAHI.render();


    //Make respiratory events table
    let respEvents = [{Code: "TotalSleep", Name: "Total Sleep", Duration: totalSleepSeconds, Count: 0} ];
    for (let session of data.Sessions)
        {
            if (!session.Enabled) continue;
            for (let sessionChannel of session.Channels)
            {
                if (sessionChannel.Type != 4 && sessionChannel.Type != 8 && sessionChannel.Type != 16) continue;

                for (let respEventDuration of sessionChannel.Data)
                {
                    let respEvent = respEvents.find(x => x.Code == sessionChannel.Code);
                    if (respEvent == null){
                        respEvent = {
                            Code: sessionChannel.Code,
                            Name: sessionChannel.Name,
                            Duration: 0,
                            Count: 0
                        }
                        respEvents.push(respEvent);
                    }

                    respEvent.Duration += respEventDuration;
                    respEvent.Count++;
                }
            }
        }


        for (let respEvent of respEvents){
            respEvent.TimeRatio = respEvent.Duration / totalSleepSeconds
            respEvent.TimePercentage = respEvent.TimeRatio * 100;
            respEvent.Index = respEvent.Count / totalSleepHours;
        }

        console.table(respEvents);

        $("#tblRespiratoryEvents").empty();
        for (let respEvent of respEvents) {

            let duration = moment.duration(respEvent.Duration * 1000);

            let row = $(`<tr></tr>`);
            let cellChannel = $(`<td></td>`).text(respEvent.Name);
            let cellPercentage = $(`<td></td>`).text(respEvent.TimePercentage.toFixed(1));
            let cellDuration = $(`<td></td>`).text(`${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`);
            //let cellDuration = $(`<td></td>`).text(`${duration.humanize()}`);
            $(row).append([cellChannel, cellPercentage, cellDuration]);
            $("#tblRespiratoryEvents").append(row);
        }


}

function getAllChannelCodes(data, channelTypeFilter){
    channelCodes = [];
    data.Sessions.forEach(session => {
        session.Channels.forEach(channel => {
            if (channel.Type == channelTypeFilter)
            {
                if (channelCodes.indexOf(channel.Code) < 0)
                    channelCodes.push(channel.Code);
            }
        });
    });
    return channelCodes;
}

async function makeWaveformCharts(data){

    let sessions = data.Sessions;
    let channelCodes = getAllChannelCodes(data, ChannelTypeWaveform);

    let pressureCharts = ["Pressure", "EPAP", "IPAP", "IPAPLo", "IPAPHi", "EEPAP", "PressureSet", "EPAPSet", "IPAPSet"];
    await createChartForChannel(sessions, pressureCharts, {forceTitle: "Pressure", additionalSeriesOptions: {type: "stepLine"}});

    channelCodes = channelCodes.filter(x => pressureCharts.indexOf(x) < 0);

    /*for (let channelCode of channelCodes){
        await createChartForChannel(sessions, channelCode);
    }*/


    for (var i = 0; i < graphs.length; i++) {
        let newSettings = {
            labelAngle: 0,
            crosshair: {
                enabled: true,
                snapToDataPoint: true,
                valueFormatString: timeFormatChart.replace("A", "TT")
            }
        };
        let oldSettings = graphs[i].chart.options.axisX;
        graphs[i].chart.options.axisX = {...oldSettings, ...newSettings};
    }


    //Synchronize margins
    var axisYBoundMax = 0;
    graphs.forEach(x => axisYBoundMax = Math.max(axisYBoundMax, x.chart.axisY[0].bounds.x2));
    graphs.forEach(x => x.chart.axisY[0].set("margin", axisYBoundMax - (x.chart.axisY[0].bounds.x2 - x.chart.axisY[0].bounds.x1)));



    setTimeout(() => {
        syncCharts(graphs.map(c => { return c.chart }), true, true, true);
        graphs.forEach(x => x.chart.render());
    }, 500);

}

async function displayTimeline(data){
    if (timeline != null)
    {
        timeline.stage.enableMouseOver(-1);
        timeline.stage.enableDOMEvents(false);
        timeline.stage.removeAllEventListeners();
        timeline.stage.removeAllChildren();
        timeline.stage.canvas = null;
        timeline.stage = null;
        $("#pnlTimeline").empty();
    }

    let flagChannels = [];
    for (let session of data.Sessions){
        if (!session.Enabled) continue;

        for (let channel of session.Channels)
        {
            if (channel.Type != 4 && channel.Type != 8 && channel.Type != 16) continue;

            let flagChannel = flagChannels.find(x => x.Code == channel.Code);
            if (flagChannel == null){
                flagChannel = {
                    Type: channel.Type,
                    Code: channel.Code,
                    Name: channel.Name,
                    Description: channel.Description,
                    Label: channel.Label ?? channel.Code,
                    Data: [],
                    Time: []
                };
                flagChannels.push(flagChannel);
            }

            flagChannel.Data = flagChannel.Data.concat(channel.Data);
            flagChannel.Time = flagChannel.Time.concat(channel.Time);
        }
    }


    timeline = { flagChannels: flagChannels };

    let sampleCanvas = graphs[0].chart.canvas;
    let samplePlotArea = graphs[0].chart.plotArea;
    let offsetLeft = graphs[0].chart.axisY[0].bounds.x2;
    let offsetBottom = graphs[0].chart.axisX[0].bounds.y1;
    let xAxisHeight = graphs[0].chart.axisX[0].bounds.y2 - graphs[0].chart.axisX[0].bounds.y1;

    let canvasHeight = (flagChannels.length * 25) + xAxisHeight;

    let canvas = $(`<canvas width="${sampleCanvas.width}" height="${canvasHeight}px" id="chtTimeline"/>`)
    $("#pnlTimeline").append(canvas);
    timeline.stage = new createjs.Stage("chtTimeline");
    let stage = timeline.stage;

    //Axis Lines
    let yAxis = new createjs.Shape();
    yAxis.graphics.setStrokeStyle(1).beginStroke("#000000");
    yAxis.graphics.moveTo(offsetLeft+0.5,0).lineTo(offsetLeft+0.5, canvasHeight - xAxisHeight +0.5);
    stage.addChild(yAxis);
    timeline.yAxis = yAxis;

    let xAxis = new createjs.Shape();
    xAxis.graphics.setStrokeStyle(1).beginStroke("#000000");
    xAxis.graphics.moveTo(offsetLeft+0.5,canvasHeight - xAxisHeight +0.5).lineTo(samplePlotArea.x2+0.5, canvasHeight - xAxisHeight +0.5);
    stage.addChild(xAxis);
    timeline.xAxis = xAxis;

    //Events Labels and striped table
    let idx = 0;
    timeline.labels = [];
    timeline.stripes = [];
    for (let flagChannel of flagChannels){
        let label = new createjs.Text(flagChannel.Label, "12px Poppins", "#000000");
        label.x = offsetLeft - label.getMeasuredWidth() - 5;
        label.y = (idx * 25) + ((25 - label.getMeasuredHeight())/2);
        stage.addChild(label);
        timeline.labels.push(label);

        let stripe = new createjs.Shape();
        stripe.graphics.beginFill(idx % 2 == 0 ? "#ffffff" : "#edf6f7");
        stripe.graphics.drawRect(offsetLeft+1, idx*25, samplePlotArea.x2 - offsetLeft-1, 25);
        stage.addChild(stripe);
        timeline.stripes.push(stripe);
        idx++;
    }

    idx = 0;

    

    //Individual events
    let startTimestamp = data.Sessions.find(s => s.Enabled).SessionStart;
    let endTimestamp = data.Sessions.findLast(s => s.Enabled).SessionEnd;
    let totalDuration = endTimestamp - startTimestamp;
    let plotWidth = samplePlotArea.x2 - samplePlotArea.x1;

    let plotArea = {x1: offsetLeft, y1: 0, x2: samplePlotArea.x2, y2: 25 * flagChannels.length, width: plotWidth, height: 25 * flagChannels.length};

    let calcTimestampX = (tm) =>{  return (((tm - startTimestamp) / totalDuration) * plotWidth) + offsetLeft  };
    let calcTimeWidth = (dur) => { return Math.max(2, (dur / totalDuration) * plotWidth); };
    let calcTimestampFromX = (x) => { return (((x - plotArea.x1) / plotArea.width) * totalDuration)+startTimestamp;}

    for (let flagChannel of flagChannels){
        flagChannel.shapes = [];
        for (let evtIndex = 0; evtIndex < flagChannel.Data.length; evtIndex++){
            let flagShape = new createjs.Shape();

            let clr = Object.keys(FLAG_COLORS).indexOf(flagChannel.Label) < 0 ? UnknownFlagColors[unknownColorIndex++ % UnknownFlagColors.length] : FLAG_COLORS[flagChannel.Label];

            flagShape.graphics.setStrokeStyle(1).beginStroke(clr[0]).beginFill(clr[1]);
            let x = calcTimestampX(flagChannel.Time[evtIndex] - flagChannel.Data[evtIndex]);
            let width = calcTimeWidth(flagChannel.Data[evtIndex]);
            flagShape.graphics.drawRect(x, idx*25, width, 25);

            flagShapeHitArea = new createjs.Shape();
            flagShapeHitArea.graphics.beginFill("#ff000040").drawRect(x-5, (idx*25)-5, width+10, 25+10);
            flagShapeHitArea.setBounds(x-5, (idx*25)-5, width+10, 25+10);            
            flagShape.hitArea = flagShapeHitArea;

            stage.addChild(flagShape);
            flagChannel.shapes.push(flagShape);

            //flagShape.enableMouseOver();
            flagShape.on("mouseover", (evt) => {
                showEventBubble(`${flagChannel.Name}: ${flagChannel.Data[evtIndex]}s`, evt.stageX, evt.stageY);
                stage.update();
            });

            flagShape.on("rollout", () => {
                hideEventBubble();
                stage.update();
            })

        }

        idx++;
    }

    //Crosshair
    let crosshairLine = new createjs.Shape();
    crosshairLine.graphics.setStrokeStyle(1).setStrokeDash([3,2]).beginStroke("#000000DD");
    crosshairLine.graphics.moveTo(0.5,0).lineTo(0.5, flagChannels.length*25);
    crosshairLine.visible = false;
    crosshairLine.mouseEnabled = false;
    timeline.crosshair = {line: crosshairLine}
    stage.addChild(crosshairLine);

    //Crosshair Tooltip
    let crosshairTooltipContainer = new createjs.Container();
    let crosshairTooltipBackground = new createjs.Shape();
    let crosshairTooltipText = new createjs.Text(" ", "11px Poppins", "#ffffff");

    crosshairTooltipContainer.addChild(crosshairTooltipBackground);
    crosshairTooltipContainer.addChild(crosshairTooltipText);

    timeline.crosshair.container = crosshairTooltipContainer;
    timeline.crosshair.text = crosshairTooltipText;
    timeline.crosshair.background = crosshairTooltipBackground;

    timeline.crosshair.text.x = 4;
    timeline.crosshair.text.y = 4;
    timeline.crosshair.container.y = plotArea.y2 + 2;
    timeline.crosshair.container.visible = false;

    timeline.crosshair.backgroundCommand = crosshairTooltipBackground.graphics.beginFill("#000000").drawRect(0,0,10,15).command;
    
    stage.addChild(crosshairTooltipContainer);

    let updateCrosshairText = (dt) => {
        crosshairTooltipText.text = moment(dt).format(`${dateFormat} ${timeFormat}`);
        timeline.crosshair.backgroundCommand.w = crosshairTooltipText.getMeasuredWidth() + 8;
        timeline.crosshair.backgroundCommand.h = crosshairTooltipText.getMeasuredHeight() + 5;        
    };

    let updateCrosshairTooltipPosition = (x) => {
        let proposedX = x - (timeline.crosshair.backgroundCommand.w / 2);
        if (proposedX < 0) proposedX = 0;
        if (proposedX + timeline.crosshair.backgroundCommand.w > plotArea.x2) proposedX = plotArea.x2 - timeline.crosshair.backgroundCommand.w;
        timeline.crosshair.container.x = proposedX;        
    }

    //Event Bubble
    let eventBubble = new createjs.Container();
    let eventBubbleText = new createjs.Text(" ", "15px Poppins", "#000000");
    let eventBubbleShape = new createjs.Shape();

    let eventBubbleRect = eventBubbleShape.graphics.beginFill("#ffffff").beginStroke("#4F81BC").drawRoundRect(0,0,10,10, 6,6,6,6).command;
    eventBubbleShape.shadow = new createjs.Shadow("#00000060", 5, 5, 10);
    eventBubbleText.x = 8;
    eventBubbleText.y = 8;
    

    eventBubble.addChild(eventBubbleShape);
    eventBubble.addChild(eventBubbleText);

    timeline.eventBubble = {
        container: eventBubble,
        text: eventBubbleText,
        shape: eventBubbleShape,
        shapeCommand: eventBubbleRect        
    }

    eventBubble.visible = false;
    stage.addChild(eventBubble);

    let showEventBubble = (text, x, y) => {
        eventBubbleText.text = text;
        eventBubbleRect.w = eventBubbleText.getMeasuredWidth() + 16;
        eventBubbleRect.h = eventBubbleText.getMeasuredHeight() + 16;

        let proposedX = x + 3;
        if (proposedX < 0) proposedX = 0;
        if (proposedX + eventBubbleRect.w > plotArea.width) proposedX = x - eventBubbleRect.w - 3;
        eventBubble.x = proposedX;

        let proposedY = y + 20;
        if (proposedY < 0) proposedY = 0;
        if (proposedY + eventBubbleRect.h > plotArea.height) proposedY = y - 40;
        eventBubble.y = proposedY;

        eventBubble.visible = true;        
    }

    let hideEventBubble = () => { eventBubble.visible = false; }

    //Mouse Events
    stage.on("stagemousemove", (evt) => {
        if (evt.stageX >= plotArea.x1 && evt.stageX <= plotArea.x2)
        {
            crosshairLine.visible = true;
            crosshairLine.x = evt.stageX;
            timeline.crosshair.container.visible = true;
            updateCrosshairText(calcTimestampFromX(evt.stageX));
            updateCrosshairTooltipPosition(evt.stageX);
            stage.update();
        } else {
            crosshairLine.visible = false;
            timeline.crosshair.container.visible = false;
            stage.update();
        }
    });

    stage.enableMouseOver();
    stage.on("mouseout", () => {
        crosshairLine.visible = false;
        timeline.crosshair.container.visible = false;
        stage.update();
    });

    stage.update();

}

async function loadData(url) {
    $("#pnlLoadingText").text("Downloading Shared Data...");
    jsonData = await getDataJson(url);
    let sessions = jsonData.Sessions;
    if (sessions == null || sessions.length == 0) return;

    sessions.forEach(x => x.Enabled = true);
    
    displayMachineSettings(jsonData);
    displaySessions(jsonData);

    await onChangeSessions();

    return;

    
    
    await makeWaveformCharts(jsonData);
    await displayTimeline(jsonData);
    displayStatistics(jsonData);
    $("#pnlLoading").hide();
}

function delay(ms){ return new Promise(res => {setTimeout(res, ms); })}

async function createChartForChannel(sessions, channelCodes, options) {

    //Create the data for the channel by combining all the channels.
    let defaultOptions = {
        additionalChartOptions: null,
        additionalSeriesOptions: null
    }

    options = {...defaultOptions, ...options};

    if (!Array.isArray(channelCodes)) channelCodes = [channelCodes];

    let series = [];

    let channel = null;

    for (let channelCode of channelCodes)
    {
        var data = [];

        for (let session of sessions){
            if (!session.Enabled) continue;
            let sessionChannel = session.Channels.find(x => x.Code == channelCode);
            if (sessionChannel == null) continue;

            $("#pnlLoadingText").text(`Creating ${sessionChannel.Name} Chart...`);
            await delay(1);

            //Get a reference to this channel from any session that contains it.
            channel = sessionChannel;

            let sessionChannelData = sessionChannel.Data.map((itm, idx) => {
                return {
                    x: new Date(sessionChannel.Time[idx]), y: itm
                }
            });


            sessionChannelData.push({x: new Date(sessionChannel.Time[sessionChannel.Time.length-1] + 1), y: null });

            data = data.concat(sessionChannelData);

            //data.push(...sessionChannelData);
        }


        let defaultSeriesOptions = {
            name: channel == null ? "" : channel.Name,
            type: "line",
            connectNullData: false,
            yValueFormatString: `#0.## ${channel.Units}`,
            xValueFormatString: `${dateFormat} ${timeFormatChart}`,
            xValueType: "dateTime",
            showInLegend: false,
            lineThickness: 1,
            dataPoints: data
        };

        series.push({...defaultSeriesOptions, ...options.additionalSeriesOptions});
    }


    let chartContainer = $(`<div class="graph-container"></div>`)
    //$(chartContainer).attr("data-channel-code", channelCode);
    $("#pnlGraphs").append(chartContainer);


    let chartDefaultOptions = {
        animationEnabled: true,
        zoomEnabled: true,
        /*backgroundColor: null,*/
        title: {},
        axisX: {
            valueFormatString: timeFormat.replace("A", "TT"),
            /*titleFontColor: "#ffffff",
            labelFontColor: "#ffffff",*/
            titleFontFamily: 'Poppins',
            labelFontFamily: 'Poppins',
            gridColor: "#DDDDDD",
            titleFontSize: 20
        },
        axisY: {
            title: options.forceTitle ??  channel.Name,
            titleFontSize: 12,
            /*titleFontColor: "#ffffff",
            labelFontColor: "#ffffff",*/
            titleFontFamily: 'Poppins',
            labelFontFamily: 'Poppins',
            //labelMaxWidth: 200,
            //labelAutoFit: false,
            //labelWrap: true,
            //titleMaxWidth: 200,
            //margin: 50
            //labelAngle: 90
            gridColor: "#DDDDDD"
        },
        toolTip: {
            shared: true,
            fontFamily: 'Poppins',
            cornerRadius: 5,
            content: "{name}: {y}"

        },
        data: series
    };

    let chartOptions = {...chartDefaultOptions, ...options.additionalChartOptions}


    let chart = new CanvasJS.Chart($(chartContainer)[0], chartOptions);
    chart.render();

    graphs.push({
        chart: chart,
        container: chartContainer
    });

}

function syncCharts(charts, syncToolTip, syncCrosshair, syncAxisXRange) {

    if (!this.onToolTipUpdated) {
        this.onToolTipUpdated = function (e) {
            try{
                for (var j = 0; j < charts.length; j++) {
                    if (charts[j] != e.chart)
                        if (e.entries[0].xValue != null)
                            charts[j].toolTip.showAtX(e.entries[0].xValue);
                }
            }catch
            {

            }
        }
    }

    if (!this.onToolTipHidden) {
        this.onToolTipHidden = function (e) {
            for (var j = 0; j < charts.length; j++) {
                if (charts[j] != e.chart)
                    charts[j].toolTip.hide();
            }
        }
    }

    if (!this.onCrosshairUpdated) {
        this.onCrosshairUpdated = function (e) {
            for (var j = 0; j < charts.length; j++) {
                if (charts[j] != e.chart)
                    charts[j].axisX[0].crosshair.showAt(e.value);
            }
        }
    }

    if (!this.onCrosshairHidden) {
        this.onCrosshairHidden = function (e) {
            for (var j = 0; j < charts.length; j++) {
                if (charts[j] != e.chart)
                    charts[j].axisX[0].crosshair.hide();
            }
        }
    }

    if (!this.onRangeChanged) {
        this.onRangeChanged = function (e) {
            for (var j = 0; j < charts.length; j++) {
                if (e.trigger === "reset") {
                    charts[j].options.axisX.viewportMinimum = charts[j].options.axisX.viewportMaximum = null;
                    charts[j].options.axisY.viewportMinimum = charts[j].options.axisY.viewportMaximum = null;
                    charts[j].render();
                } else if (charts[j] !== e.chart) {
                    charts[j].options.axisX.viewportMinimum = e.axisX[0].viewportMinimum;
                    charts[j].options.axisX.viewportMaximum = e.axisX[0].viewportMaximum;
                    charts[j].render();
                }
            }
        }
    }

    for (var i = 0; i < charts.length; i++) {

        //Sync ToolTip
        if (syncToolTip) {
            if (!charts[i].options.toolTip)
                charts[i].options.toolTip = {};

            charts[i].options.toolTip.updated = this.onToolTipUpdated;
            charts[i].options.toolTip.hidden = this.onToolTipHidden;
        }

        //Sync Crosshair
        if (syncCrosshair) {
            if (!charts[i].options.axisX)
                charts[i].options.axisX = { crosshair: { enabled: true } };

            charts[i].options.axisX.crosshair.updated = this.onCrosshairUpdated;
            charts[i].options.axisX.crosshair.hidden = this.onCrosshairHidden;
        }

        //Sync Zoom / Pan
        if (syncAxisXRange) {
            charts[i].options.zoomEnabled = true;
            charts[i].options.rangeChanged = this.onRangeChanged;
        }
    }
}




/****************************************************************************************/
// Stats Functions
/****************************************************************************************/

/** Extract the maximum in an array of values
*
* @arg arr - array
* @return float
*/
function calcMax(arr) {
    return Math.max(...arr);
}

/** Calculate the Median of an array of values
 *
 */
function calcMedian(arr) {
    /*var a = arr.slice();
    hf = Math.floor(a.length / 2);
    arr = sortArr(a);
    if (a.length % 2) {
        return a[hf];
    } else {
        return (parseFloat(a[hf - 1]) + parseFloat(a[hf])) / 2.0;
    }*/
        const sorted = Array.from(arr).sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);

        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        }

        return sorted[middle];

}

/** Extract the maximum in an array of values
*
* @arg arr - array
* @return float
*/
function calcMin(arr) {
    return Math.min(...arr);
}

/** Calculate the Modal value
*
* @arg arr - array
* @return float
*/
function calcMode(arr) {
    var ary = arr.slice();
    t = ary.sort(function (a, b) {
        ary.filter(function (val) {
            val === a
        }).length - ary.filter(function (val) {
            val === b
        }).length
    });
    return t.pop();
}

/** Calculate the 'q' quartile of an array of values
*
* @arg arr - array of values
* @arg q - percentile to calculate (e.g. 95)
*/
function calcQuartile(arr, q) {
    var a = arr.slice();
    // Turn q into a decimal (e.g. 95 becomes 0.95)
    q = q / 100;

    // Sort the array into ascending order
    data = sortArr(a);

    // Work out the position in the array of the percentile point
    var p = ((data.length) - 1) * q;
    var b = Math.floor(p);

    // Work out what we rounded off (if anything)
    var remainder = p - b;

    // See whether that data exists directly
    if (data[b + 1] !== undefined) {
        return parseFloat(data[b]) + remainder * (parseFloat(data[b + 1]) - parseFloat(data[b]));
    } else {
        return parseFloat(data[b]);
    }
}

/** Calculate the range for a set of values
*
* @arg arr - array
* @return float
*/
function calcRange(arr) {
    mx = calcMax(arr);
    mn = calcMin(arr);
    return mx - mn;
}

/** Sum all values in an array
 *
 */
function sumArr(arr) {
    var a = arr.slice();
    return a.reduce(function (a, b) { return parseFloat(a) + parseFloat(b); });
}

/** Sort values into ascending order
*
*/
function sortArr(arr) {
    var ary = arr.slice();
    ary.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    return ary;
}

