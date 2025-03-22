var jsonData = null;
let graphs = [];
let graphAHI = null;
let timeline = null;

let dateFormat = "YYYY/MM/DD";
let timeFormat = "HH:mm:ss";
let timeFormatChart = "HH:mm:ss.fff";

let currentLocale = (navigator.languages && navigator.languages.length) ? navigator.languages[0] : navigator.language;

const  ChannelTypeData = 1;
const  ChannelTypeSetting = 2;
const  ChannelTypeFlag = 4;
const  ChannelTypeMinorFlag = 8;
const  ChannelTypeSpan = 16;
const  ChannelTypeWaveform = 32;
const  ChannelTypeUnknown = 64;

const CHART_PAN_UPDATE_INTERVAL = 0;

const AHI_CHANNELS = ["ClearAirway", "AllApnea", "Obstructive", "Hypopnea", "Apnea"];

const IGNORE_CHANNELS = ["MaskPressureHi"];

let PRESSURE_CHART_CODES = ["Pressure", "EPAP", "IPAP", "IPAPLo", "IPAPHi", "EEPAP", "PressureSet", "EPAPSet", "IPAPSet"];

const STATS_CHANNEL_CODES = ["Pressure", "PressureSet", "EPAP", "EPAPSet", "IPAP", "IPAPSet",
    "PS", "PTB", "PRS1PeakFlow", "Prisma_ObstructLevel", "Prisma_PressureMeasured", "Prisma_rRMV", "Prisma_rMVFluctuation",
    "MinuteVent", "RespRate", "RespEvent", "FLG",
    "Leak", "LeakTotal", "Snore", "IE", "Ti", "Te", "TgMV",
     "TidalVolume", "Pulse", "SPO2", "Inclination", "Orientation", "Motion"

];

//Channels visible by default
let channelVisibility = [
    {"Code": "FLG", Visible: true},
    {"Code": "Leak", Visible: true},
];

const FLAG_COLORS = {
    OA: ["#8f271f", "#e03c2f"],
    H: ["#77852c", "#d4ed47"],
    CA: ["#377d8c", "#41c3e0"],
    LL: ["#7a8182", "#d5e0e3"],
    CSR: ["#421163", "#a033e8"],
}

const UNKNOWN_FLAG_COLORS = [
    ["#871c60", "#e31e9b"],
    ["#8f7014", "#d1a215"],
    ["#0c8710", "#1ad920"],
    ["#2c1178", "#5125cc"]
];

let flagVisibility = [];

var unknownColorIndex = 0;
let tmrWindowResize = 0;
let tmrPan = 0;
let graphMode = "Pan";

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

function onWindowResize(){
    displayTimeline(jsonData);
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

    await displayChannelList(jsonData);
    await makeWaveformCharts(jsonData);
    await overlayFlowRespiratoryEvents(jsonData);
    displayStatistics(jsonData);
    await displayTimeline(jsonData);

    $("#pnlLoading").hide();
}

async function getDataJson(url) {
    let result = null;

    try{
        result = await fetch(url);
        if (result.ok == false)
            throw new Error("Failed to fetch url: "+result.status);
    }
    catch(err){
        console.error(`Could not fetch data from url ${url}`, err);
        return;
    }

    if (result == null) return;

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

function displayChannelList(data){

    allWaveformChannels = [];

    for (let session of data.Sessions)
    {
        if (!session.Enabled) continue;

        for (let channel of session.Channels)
        {
            if (channel.Type != ChannelTypeWaveform) continue;
            if (IGNORE_CHANNELS.indexOf(channel.Code) >= 0) continue;

            //Do not allow pressure charts to be turned off
            if (PRESSURE_CHART_CODES.indexOf(channel.Code) >= 0) continue;
            if (channel.Code == "FlowRate") continue; //Do not allow flow rate to be turned off

            if (allWaveformChannels.find(w => w.Code == channel.Code)) continue;

            allWaveformChannels.push({
                Code: channel.Code,
                Type: channel.Type,
                Label: channel.Label,
                Name: channel.Name
            });

        }
    }

    $("#pnlChannelSelect").empty();
    for (let channel of allWaveformChannels){
        let chShow = channelVisibility.find(x => x.Code == channel.Code);
        if (chShow == null) {
            chShow = {Code: channel.Code, Visible: false};
            channelVisibility.push(chShow);
        }

        let row = $(`<div class="channel"></div>`);
        let cellCheck = $(`<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" checked>`);
        if (!chShow.Visible){ $("input", cellCheck).removeAttr("checked"); }
        let cellLabel = $(`<div></div>`).text(channel.Name);

        $(row).append([cellCheck, cellLabel]);

        $("input", cellCheck).on("change", () => {
            chShow.Visible = $("input", cellCheck).prop("checked");
            let graph = graphs.find(g => g.channelCodes.indexOf(channel.Code) >= 0);
            if (graph){
                $(graph.container).toggleClass("hidden", !chShow.Visible);
                graph.chart.render();
            } 

         });

        $("#pnlChannelSelect").append(row);
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


    let stats = [];

    for (let statsChannelCode of STATS_CHANNEL_CODES)
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

    //console.log(stats);

    let formatter = new Intl.NumberFormat(currentLocale, {maximumFractionDigits: 2})

    for (let stat of stats) {

        let row = $(`<tr></tr>`);
        let cellChannel = $(`<td></td>`).text(stat.ChannelName);
        let cellMin = $(`<td></td>`).text(formatter.format(stat.Min));
        let cellMed = $(`<td></td>`).text(formatter.format(stat.Median));
        let cell95 = $(`<td></td>`).text(formatter.format(stat.Percent95));
        let cell995 = $(`<td class="hide-xs"></td>`).text(formatter.format(stat.Percent995));
        let cellMax = $(`<td></td>`).text(formatter.format(stat.Max));
        let cellUnits = $(`<td class="hide-xs"></td>`).text(stat.ChannelUnit);
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
                        Label: sessionChannel.Label,
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

    //console.log("Total sleep: ", totalSleepSeconds);
    //console.table(ahiChannels);

    $("#lblAHIValue").text(totalAhi.toFixed(2));

    if (graphAHI) graphAHI.destroy();

    let dataPoints = [];
    for (let ahiChannel of ahiChannels){
        let shortCode = ahiChannel.Label;
        /*switch (ahiChannel.Code)
        {
            case "Obstructive": shortCode = "OA"; break;
            case "ClearAirway": shortCode = "CSA"; break;
            case "Hypopnea": shortCode = "H"; break;
            case "AllApnea": shortCode = "AA"; break;
            case "lApnea": shortCode = "A"; break;
        }*/
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

        //console.table(respEvents);

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

    let removeChannelsFromList = (channels) => { channelCodes = channelCodes.filter(x => channels.indexOf(x) < 0); };

    await createChartForChannel(sessions, PRESSURE_CHART_CODES, {forceTitle: "Pressure", additionalSeriesOptions: {type: "stepLine"}});
    removeChannelsFromList(PRESSURE_CHART_CODES);

    await createChartForChannel(sessions, ["FlowRate"], {additionalSeriesOptions: {}});
    removeChannelsFromList(["FlowRate"]);

    //Flow limit
    await createChartForChannel(sessions, ["FLG"], {additionalSeriesOptions: {}});
    removeChannelsFromList(["FLG"]);

    for (let channelCode of channelCodes){
        //if (graphs.length > 2) continue; //RC LIMITCHARTS
        if (IGNORE_CHANNELS.indexOf(channelCode) >= 0) continue;

        let chartVis = channelVisibility.find(x => x.Code == channelCode)
        if (chartVis == null){
            console.log("Unknown chart visibility");
        }
        let showChart = chartVis.Visible;

        await createChartForChannel(sessions, channelCode, {visible: showChart});
    }


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
    setChartMode(graphMode);


    setTimeout(() => {
        syncCharts(graphs.map(c => { return c.chart }), true, true, true);
        graphs.forEach(x => x.chart.render());
        setChartMode(graphMode);
    }, 500);

}

async function overlayFlowRespiratoryEvents(data){
    let flowChart = graphs.find(x => x.channelCodes.indexOf("FlowRate") >= 0);
    if (flowChart == null) return;

    flowChart.chart.options.axisX.stripLines = [];

    let respEvents = [];

    for (let session of data.Sessions)
    {
        if (!session.Enabled) continue;
        for (let sessionChannel of session.Channels)
        {
            if (sessionChannel.Type != 4 && sessionChannel.Type != 8 && sessionChannel.Type != 16) continue;

            for (let i = 0; i < sessionChannel.Data.length; i++)
            {
                let evtDuration = sessionChannel.Data[i];
                let evtStart = sessionChannel.Time[i] - (sessionChannel.Data[i] * 1000);
                let evtEnd = sessionChannel.Time[i];

                let respEvent = respEvents.find(x => x.Code == sessionChannel.Code);
                if (respEvent == null){
                    respEvent = {
                        Code: sessionChannel.Code,
                        Type: sessionChannel.Type,
                        Name: sessionChannel.Name,
                        Label: sessionChannel.Label,
                        Events: []
                    }
                    respEvents.push(respEvent);
                }

                respEvent.Events.push({
                    Start: evtStart,
                    End: evtEnd,
                    Duration: evtDuration
                });
            }
        }
    }

    respEvents = respEvents.sort((a,b) => a.Type > b .Type ? 0 : (a.Type < b.Type ? -1 : 0));

    unknownColorIndex = 0;
    for (let respEventType of respEvents){

        let flgVis = flagVisibility.find(x => x.Code == respEventType.Code);
        if (flgVis && !flgVis.Visible) continue;

        let clr = "black";
        if (Object.keys(FLAG_COLORS).indexOf(respEventType.Label) < 0)
        {
            clr = UNKNOWN_FLAG_COLORS[unknownColorIndex++ % UNKNOWN_FLAG_COLORS.length];
            FLAG_COLORS[respEventType.Label] = clr;
        } else clr = FLAG_COLORS[respEventType.Label];

        for (let respEvent of respEventType.Events){
            if (flowChart.chart.options.axisX.stripLines == null) flowChart.chart.options.axisX.stripLines = [];
            flowChart.chart.options.axisX.stripLines.push({
                startValue: respEvent.Start,
                endValue: respEvent.End,
                color: clr[1],
                label: respEventType.Label,
                labelFontColor: "#ffffff",
                value: respEvent.Duration,
                labelFontFamily: "Poppins",
                labelFontSize: 12,
                labelBackgroundColor: "#00000080",
                labelPlacement: "outside",
                showOnTop: true,
                opacity: 0.25,
                EventName: respEventType.Name,
                EventDuration: respEvent.Duration
            })
        }
    }

    flowChart.chart.render();

    //Hook mouseover events
    let canvas = $(flowChart.chart.canvas).next("canvas");
    if (canvas.length == 0) canvas = $(flowChart.chart.canvas);

    let mouseMoveEvent = (evt) => {
        if (evt.offsetX == null || evt.offsetY == null) return;

        //Are we in a stripLine
        let overSparkline = flowChart.chart.axisX[0].stripLines.find(s =>
            s.bounds != null &&
            evt.offsetX >= s.bounds.x1 && evt.offsetX <= s.bounds.x2 &&
            evt.offsetY >= s.bounds.y1 && evt.offsetY <= s.bounds.y2
        )
        if (overSparkline){

            $("#tooltipFlowEvent").text(`${overSparkline.options.EventName} ${overSparkline.options.EventDuration}s`);
            let tooltipWidth = $("#tooltipFlowEvent").width();

            //console.log(overSparkline.options.value, overSparkline.options.label);
            let chartRect  = evt.target.getBoundingClientRect();
            let chartBottm = chartRect.bottom - 10;

            $("#tooltipFlowEvent")
                .css("display", "block")
                .css("top", chartBottm)
                .css("left", evt.clientX - (tooltipWidth/2))

        }else{
            $("#tooltipFlowEvent")
                .css("display", "none")
        }        
    }

    $(canvas).on("mousemove touchstart", mouseMoveEvent)


}

function hideFlowChartOverlayTooltip(){
    $("#tooltipFlowEvent").css("display", "none")
}

async function displayTimeline(data){
    if (timeline != null)
    {
        try{
            timeline.stage.enableMouseOver(-1);
            timeline.stage.enableDOMEvents(false);
            timeline.stage.removeAllEventListeners();
            timeline.stage.removeAllChildren();            
            timeline.stage.canvas = null;
        }catch{};
        timeline.stage = null;
        $("#pnlTimeline").empty();
    }

    if (!data.Sessions.find(s => s.Enabled)) return;

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

    let containerInnerWidth = $("#flexGraphs").width();

    //let canvas = $(`<canvas width="${sampleCanvas.width}" height="${canvasHeight}px" id="chtTimeline"/>`)
    let canvas = $(`<canvas width="${containerInnerWidth}" height="${canvasHeight}px" id="chtTimeline"/>`)
    $("#pnlTimeline").append(canvas);
    timeline.stage = new createjs.Stage("chtTimeline");
    let stage = timeline.stage;
    createjs.Touch.enable(stage);

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
        
        timeline.labels.push({text: label, flagCode: flagChannel.Code});
        stage.addChild(label);

        label.on("click", () => {
            //toggleFlagVisibility(flagChannel.Code);                
            console.log("toggled");
        });

        let stripe = new createjs.Shape();
        stripe.graphics.beginFill(idx % 2 == 0 ? "#ffffff" : "#edf6f7");
        stripe.graphics.drawRect(offsetLeft+1, idx*25, samplePlotArea.x2 - offsetLeft-1, 25);
        stage.addChild(stripe);
        timeline.stripes.push(stripe);
        idx++;
    }

    idx = 0;

    //Helper functions and bounds
    let startTimestamp = data.Sessions.find(s => s.Enabled).SessionStart;
    let endTimestamp = data.Sessions.findLast(s => s.Enabled).SessionEnd;
    let totalDuration = endTimestamp - startTimestamp;
    let plotWidth = samplePlotArea.x2 - samplePlotArea.x1;

    let plotArea = {x1: offsetLeft, y1: 0, x2: samplePlotArea.x2, y2: 25 * flagChannels.length, width: plotWidth, height: 25 * flagChannels.length};
    timeline.plotArea = plotArea;

    let calcTimestampX = (tm) =>{  return (((tm - startTimestamp) / totalDuration) * plotWidth) + offsetLeft  };
    let calcTimeWidth = (dur) => { return Math.max(2, (dur / totalDuration) * plotWidth); };
    let calcTimestampFromX = (x) => { return (((x - plotArea.x1) / plotArea.width) * totalDuration)+startTimestamp;}

    timeline.calcTimestampX = calcTimestampX;
    timeline.calcTimeWidth = calcTimeWidth;
    timeline.calcTimestampFromX = calcTimestampFromX;
    timeline.minTimestamp = startTimestamp;
    timeline.maxTimestamp = endTimestamp;


    //Zoom masks
    let zoomMaskLeft = new createjs.Shape();
    let zoomMaskRight = new createjs.Shape();
    stage.addChild(zoomMaskLeft);
    stage.addChild(zoomMaskRight);
    zoomMaskLeft.visible = false;
    zoomMaskRight.visible = false;

    let zoomMaskLeftCommand = zoomMaskLeft.graphics.beginFill("#00000012").drawRect(plotArea.x1, 0, 0, plotArea.y2).command;
    let zoomMaskRightCommand = zoomMaskLeft.graphics.beginFill("#00000012").drawRect(plotArea.x1, 0, 0, plotArea.y2).command;

    timeline.zoomMasks = {
        left: {
            shape: zoomMaskLeft,
            command: zoomMaskLeftCommand
        },
        right: {
            shape: zoomMaskRight,
            command: zoomMaskRightCommand
        }
    }

    timeline.updateZoomMask = (dtStart, dtEnd) => {
        if (dtStart != null)
        {
            zoomMaskLeftCommand.w = calcTimestampX(dtStart) - plotArea.x1;
            zoomMaskLeft.visible = true;
        } else {
            zoomMaskLeft.visible = false;
        }

        if (dtEnd != null)
        {
            zoomMaskRightCommand.x = calcTimestampX(dtEnd);
            zoomMaskRightCommand.w = plotArea.x2 - zoomMaskRightCommand.x;
            zoomMaskRight.visible = true;
        } else {
            zoomMaskRight.visible = false;
        }

        stage.update();
    }

    //Zoom window
    let zoomWindowShape = new createjs.Shape();
    stage.addChild(zoomWindowShape);
    zoomWindowShape.visible = false;
    let zoomWindowShapeCommand = zoomWindowShape.graphics.beginFill("#4287f540").drawRect(0, 0, 0, plotArea.y2).command;
    timeline.zoomWindow = {
        shape: zoomWindowShape,
        command: zoomWindowShapeCommand,
        busy: false
    };


    //Individual events
    unknownColorIndex = 0;
    for (let flagChannel of flagChannels){
        flagChannel.shapes = [];

        let clr = "black";
        if (Object.keys(FLAG_COLORS).indexOf(flagChannel.Label) < 0)
        {
            clr = UNKNOWN_FLAG_COLORS[unknownColorIndex++ % UNKNOWN_FLAG_COLORS.length];
            FLAG_COLORS[flagChannel.Label] = clr;
        } else clr = FLAG_COLORS[flagChannel.Label];

        for (let evtIndex = 0; evtIndex < flagChannel.Data.length; evtIndex++){
            let flagShape = new createjs.Shape();

            flagShape.graphics.setStrokeStyle(1).beginStroke(clr[1]).beginFill(clr[1]);
            let x = calcTimestampX(flagChannel.Time[evtIndex] - flagChannel.Data[evtIndex]);
            let width = calcTimeWidth(flagChannel.Data[evtIndex]);
            flagShape.graphics.drawRect(x, idx*25+0.25, width-0.5, 25-0.25);

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

    timeline.updateCrosshairText = updateCrosshairText;
    timeline.updateCrosshairTooltipPosition = updateCrosshairTooltipPosition;

    timeline.updateCrosshair = (dt) => {
        let canvasX = timeline.calcTimestampX(dt);
        crosshairLine.visible = true;
        crosshairLine.x = canvasX;
        timeline.crosshair.container.visible = true;
        updateCrosshairText(dt);
        updateCrosshairTooltipPosition(canvasX);
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
            let timestampAtX = calcTimestampFromX(evt.stageX);
            updateCrosshairText(timestampAtX);
            updateCrosshairTooltipPosition(evt.stageX);
            stage.update();

            graphs.forEach(g => g.chart.axisX[0].crosshair.showAt(new Date(timestampAtX)));
        } else {
            crosshairLine.visible = false;
            timeline.crosshair.container.visible = false;
            stage.update();
        }
    });

    stage.on("pressmove", (evt) => {
        if (!timeline.zoomWindow.busy)
        {
            if (evt.stageX < plotArea.x1) return;
            timeline.zoomWindow.command.w = 0;
            timeline.zoomWindow.command.x = evt.stageX;
            timeline.zoomWindow.busy = true;
            timeline.zoomWindow.shape.visible = true;
            stage.update();
        }
        else{
            if (evt.stageX < plotArea.x1 || evt.stageX < timeline.zoomWindow.command.x) return;
            timeline.zoomWindow.command.w = evt.stageX - timeline.zoomWindow.command.x;
            stage.update();
        }
    });

    stage.on("click", (evt) => {
        console.log(`Stage clicked at ${evt.stageX}, ${evt.stageY}`);
        let labelClicked = false;
        for (let label of timeline.labels){
            let b = label.text.getTransformedBounds();
            if (evt.stageX >= b.x - 10 && evt.stageX <= b.x + b.width + 20 && evt.stageY >= b.y - 5 && evt.stageY <= b.y + b.height + 10){
                console.log(`Toggle flag ${label.flagCode}`);                
                toggleFlagVisibility(label.flagCode);                
            }
        }

    })

    stage.on("pressup", (evt) => {        
        //Zoom
        timeline.zoomWindow.busy = false;
        timeline.zoomWindow.shape.visible = false;
        stage.update();

        if (timeline.zoomWindow.command.w < 1) return;

        let rangeStart = calcTimestampFromX(timeline.zoomWindow.command.x);
        let rangeEnd = calcTimestampFromX(timeline.zoomWindow.command.x + timeline.zoomWindow.command.w);
        console.log(`Flag chart triggered zoom range from ${new Date(rangeStart)} to ${new Date(rangeEnd)}`);
        setZoomRange(rangeStart, rangeEnd);
    });

    stage.enableMouseOver();
    stage.on("mouseout", (evt) => {
        //crosshairLine.visible = false;
        //timeline.crosshair.container.visible = false;
        //stage.update();
    });

    stage.update();

}

async function toggleFlagVisibility(flagChannelCode)
{
    try{
        $("body").css("cursor", "wait");
        let flagVis = flagVisibility.find(f => f.Code == flagChannelCode);
        if (!flagVis) {
            flagVis = {Code: flagChannelCode, Visible: true};
            flagVisibility.push(flagVis);
        } 
        flagVis.Visible = !flagVis.Visible;

        let flagLabel = timeline.labels.find(l => l.flagCode == flagChannelCode);
        if (flagLabel) flagLabel.text.alpha = flagVis.Visible ? 1 : 0.4;
        timeline.stage.update();
        await delay(10);
        overlayFlowRespiratoryEvents(jsonData);
    }
    finally{
        $("body").css("cursor", "auto");
    }
}

async function loadData(url) {
    $("#pnlLoadingText").text("Downloading Shared Data...");

    try{
        jsonData = await getDataJson(url);
        let sessions = jsonData.Sessions;
        if (sessions == null || sessions.length == 0) return;

        sessions.forEach(x => x.Enabled = true);

        displayMachineSettings(jsonData);
        displaySessions(jsonData);

        await onChangeSessions();
    }
    catch(err){
        $("#pnlLoadingText").text("The data could not be loaded");
        throw err;
    }

    return;



    await makeWaveformCharts(jsonData);
    await displayTimeline(jsonData);
    displayStatistics(jsonData);
    $("#pnlLoading").hide();
}

function delay(ms){ return new Promise(res => {setTimeout(res, ms); })}

function setZoomRange(dtStart, dtEnd){
    graphs.forEach(g => {
        g.chart.options.axisX.viewportMinimum = dtStart;
        g.chart.options.axisX.viewportMaximum = dtEnd;
        g.chart.render();    
    });
    onUpdateZoomRange();
}

function getZoomRange()
{
    let chartStart = graphs.find(g => g.chart.options.axisX.viewportMinimum != null);
    let chartEnd = graphs.find(g => g.chart.options.axisX.viewportMinimum != null);

    let dtStart = chartStart != null ? chartStart.chart.options.axisX.viewportMinimum : null;
    let dtEnd = chartEnd != null ? chartEnd.chart.options.axisX.viewportMaximum : null;

    return {start: dtStart ?? timeline.minTimestamp, end: dtEnd ?? timeline.endTimestamp};

}

function zoomOut(){
    let currentZoom = getZoomRange();
    currentZoom.start = currentZoom.start ?? timeline.minTimestamp;
    currentZoom.end = currentZoom.end ?? timeline.maxTimestamp;
    let range = currentZoom.end - currentZoom.start;
    let newStart = currentZoom.start - (range / 2);
    let newEnd = currentZoom.end + (range / 2);
    if (newStart < timeline.minTimestamp) newStart = timeline.minTimestamp;
    if (newEnd > timeline.maxTimestamp) newEnd = timeline.maxTimestamp;
    setZoomRange(newStart, newEnd);
}

function zoomIn(){
    let currentZoom = getZoomRange();
    currentZoom.start = currentZoom.start ?? timeline.minTimestamp;
    currentZoom.end = currentZoom.end ?? timeline.maxTimestamp;
    let range = currentZoom.end - currentZoom.start;
    let newStart = currentZoom.start + (range / 4);
    let newEnd = currentZoom.end - (range / 4);
    if (newStart < timeline.minTimestamp) newStart = timeline.minTimestamp;
    if (newEnd > timeline.maxTimestamp) newEnd = timeline.maxTimestamp;
    setZoomRange(newStart, newEnd);
}

function panLeft(){
    let currentZoom = getZoomRange();
    currentZoom.start = currentZoom.start ?? timeline.minTimestamp;
    currentZoom.end = currentZoom.end ?? timeline.maxTimestamp;
    let range = currentZoom.end - currentZoom.start;
    let shiftBy = range * 0.8;
    let newStart = currentZoom.start - shiftBy;
    let newEnd = currentZoom.end - shiftBy;
    if (newStart < timeline.minTimestamp) {newStart = timeline.minTimestamp; newEnd = newStart + range};
    if (newEnd > timeline.maxTimestamp) newEnd = timeline.maxTimestamp;
    setZoomRange(newStart, newEnd);
}

function panRight(){
    let currentZoom = getZoomRange();
    currentZoom.start = currentZoom.start ?? timeline.minTimestamp;
    currentZoom.end = currentZoom.end ?? timeline.maxTimestamp;
    let range = currentZoom.end - currentZoom.start;
    let shiftBy = range * 0.8;
    let newStart = currentZoom.start + shiftBy;
    let newEnd = currentZoom.end + shiftBy;
    if (newStart < timeline.minTimestamp) newStart = timeline.minTimestamp;
    if (newEnd > timeline.maxTimestamp) {newEnd = timeline.maxTimestamp; newStart = newEnd - range };
    setZoomRange(newStart, newEnd);
}

function onUpdateZoomRange(){
    let chartStart = graphs.find(g => g.chart.options.axisX.viewportMinimum != null);
    let chartEnd = graphs.find(g => g.chart.options.axisX.viewportMinimum != null);

    let dtStart = chartStart != null ? chartStart.chart.options.axisX.viewportMinimum : null;
    let dtEnd = chartEnd != null ? chartEnd.chart.options.axisX.viewportMaximum : null;

    hideFlowChartOverlayTooltip();

    timeline.updateZoomMask(dtStart, dtEnd);
}

async function createChartForChannel(sessions, channelCodes, options) {

    //Create the data for the channel by combining all the channels.
    let defaultOptions = {
        additionalChartOptions: null,
        additionalSeriesOptions: null,
        visible: true
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

        if (data.length == 0) continue;


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

    if (series.length == 0) return;

    let chartContainer = $(`<div class="graph-container"></div>`).toggleClass("hidden", !options.visible);
    //$(chartContainer).attr("data-channel-code", channelCode);
    $("#pnlGraphs").append(chartContainer);


    let chartDefaultOptions = {
        animationEnabled: false,
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
        container: chartContainer,
        channelCodes: channelCodes
    });

}

function setChartMode(mode){
    graphMode = mode;
    graphs.forEach(g => {
        g.chart.panEnabled = mode == "Pan" ? 1 : 0;
        g.chart.zoomEnabled = mode == "Pan" ? 0 : 1;
    });
}

function syncCharts(charts, syncToolTip, syncCrosshair, syncAxisXRange) {

    if (!this.onToolTipUpdated) {
        this.onToolTipUpdated = function (e) {
            try{
                setTimeout(() => {
                    for (var j = 0; j < charts.length; j++) {
                        if (charts[j] != e.chart)
                            if (e.entries[0].xValue != null)
                                //charts[j].toolTip.showAtX(e.entries[0].xValue); //CanvasJS just doesn't show a tooltip if there isn't a data point at exactly this timestamp
                                charts[j].toolTip.showAtX(charts[j].axisX[0].crosshair.value); //Instead, use the crosshairs x position since it snaps to the last data point
                    }
                }, 50);
                

                let timestamp = e.entries[0].xValue.getTime();
                timeline.updateCrosshair(timestamp);
                timeline.stage.update();
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

            let panFn = () => {
                for (let j = 0; j < charts.length; j++) {
                    if (e.trigger === "reset") {
                        charts[j].options.axisX.viewportMinimum = charts[j].options.axisX.viewportMaximum = null;
                        charts[j].options.axisY.viewportMinimum = charts[j].options.axisY.viewportMaximum = null;
                        charts[j].render();
                    } else {//if (charts[j] !== e.chart) {                    
                        charts[j].options.axisX.viewportMinimum = e.axisX[0].viewportMinimum;
                        charts[j].options.axisX.viewportMaximum = e.axisX[0].viewportMaximum;
                        charts[j].render();
                    }
                }
                onUpdateZoomRange();
                tmrPan = 0;
                //console.log("Range updated");
            };

            if (tmrPan == 0 && CHART_PAN_UPDATE_INTERVAL > 0){
                tmrPan = setTimeout(() => panFn, CHART_PAN_UPDATE_INTERVAL);
            } else panFn();
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

window.addEventListener("resize", function() {
    clearTimeout(tmrWindowResize);
    tmrWindowResize = setTimeout(onWindowResize, 500);
});

$("body").on("keydown", function(evt) {
    switch (evt.code){
        case "ArrowLeft": panLeft(); break;
        case "ArrowRight": panRight(); break;
        case "Minus":
        case "NumpadSubtract": zoomOut(); break;
        case "NumpadAdd": zoomIn(); break
    }
    //console.log(evt.code);
});

document.addEventListener("scroll", () => {hideFlowChartOverlayTooltip()});