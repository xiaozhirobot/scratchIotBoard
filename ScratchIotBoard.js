
(function(ext) {
/**********************************************************************************/
//以下是对串口的操作
	var device = null;
    // Extension API interactions
    var potentialDevices = [];
    ext._deviceConnected = function(dev) {
        potentialDevices.push(dev);
        if (!device) {
            tryNextDevice();
        }
    }
    var watchdog = null;
	//调试用，找到一个能打开的串口就可以
/*
    function tryNextDevice() {
        // If potentialDevices is empty, device will be undefined.
        // That will get us back here next time a device is connected.
        device = potentialDevices.shift();
        if (!device) return;
	
		console.log('potentialDevices:' +potentialDevices);
		var str = JSON.stringify(potentialDevices);
		console.log('potentialDevices:' +str);
		var strdevice = JSON.stringify(device);
		console.log('device:' +strdevice);
		
        device.open({ stopBits: 0, bitRate: 57600, parityBit:0, ctsFlowControl: 0 });
		var Buf= new Uint8Array(10);
		for(var i=0;i<10;i++){
			Buf[i]=0xaa+i;
			console.log(Buf[i]);
			device.send(new Uint8Array([Buf[i]]).buffer);
		}
		
        device.set_receive_handler(function(data) {
		    var rawData = new Uint8Array(data);	
		    console.log('Received size' + data.byteLength);	
	        //放置接收的数据到环形缓冲区
	        for(var i=0;i<data.byteLength;i++){
				console.log(rawData[i]);
				BoardToScrath(rawData[i]);  
	        }
    	});
    };	
	*/
	
    function tryNextDevice() {
        // If potentialDevices is empty, device will be undefined.
        // That will get us back here next time a device is connected.
        device = potentialDevices.shift();
        if (!device) return;
	
		//console.log('potentialDevices' +potentialDevices);	    
        device.open({ stopBits: 0, bitRate: 57600, parityBit:0, ctsFlowControl: 0 });
        device.set_receive_handler(function(data) {
		    var rawData = new Uint8Array(data);	
		    //console.log('Received size' + data.byteLength);	
	        //放置接收的数据到环形缓冲区
	        for(var i=0;i<data.byteLength;i++){
				//console.log(rawData[i]);
				BoardToScrath(rawData[i]);  
	        }
    	});

   		watchdog = setTimeout(function() {
	        device.set_receive_handler(null);
	        device.close();
	        device = null;
	        tryNextDevice();
	    }, 1500);
    };	
/**********************************************************************************/
//延时函数
function delayms(ms) {	
	var	lasttime=Date.now();
	var time=0;
	while(1){
		time=Date.now() -lasttime;
		if(time>=ms)
			return;
	}
}
	
	
//以下是对板子到Scratch传递数据的处理	
	var	MAX_FRAME_SZ=500;
    var	FrameStep=0;
    var FrameBuf= new Uint8Array(MAX_FRAME_SZ+10);
    var DataLen=0;

	var inputs = {
        'D1': 0,
        'D2': 0,
        'D3': 0,
        'D4': 0,
        'A1': 0,
        'A2': 0,
        'A3': 0
    };
	
	var	IRText= "111,223";
	
 	function getSensor(which) {
        return inputs[which];
    }
    ext.sensor = function(which) { return getSensor(which); };	
	ext.IRRemoteRx=function() {
		return IRText;
	}
	
	//计算一字节的累加和
	function CalByteCs(buf,sz) {
		var	sum=0;
		for(var i=0;i<sz;i++){	
			sum=sum+buf[i];
		}
		return (sum%256);
	}
	
	//获取红外遥控的相关数据	
    function GetIRDataFromFrame(Frame){	
		var Len=Frame[2]*256+Frame[3];
		if(Len>MAX_FRAME_SZ)
			return;
		IRText= "";
		for(var i=0;i<Len;i=i+2){
			var tmp=Frame[4+i]*256+Frame[5+i];
			IRText=IRText+tmp.toString();
			if(i<(DataLen-2))
				IRText=IRText+',';
		}
	}
	
	//获取传感器的相关数据	
    function GetSensorFromFrame(Frame){
		inputs['D1']=(Frame[4]>>0)&0x01;
		inputs['D2']=(Frame[4]>>1)&0x01;    
    	inputs['D3']=(Frame[4]>>2)&0x01;
		inputs['D4']=(Frame[4]>>3)&0x01;
		var tmp=0;
		tmp=Frame[5]*256+Frame[6]; 
		inputs['A1']= (100 * tmp) / 4096;
		
		tmp=Frame[7]*256+Frame[8];     
		inputs['A2']= (100 * tmp) / 4096;
		   
		tmp=Frame[9]*256+Frame[10];     
		inputs['A3']= (100 * tmp) / 4096;
		console.log("D1:"+inputs['D1']+" D2:"+inputs['D2']+" D3:"+inputs['D3']+" D4:"+inputs['D4']+"A1:"+inputs['A1']+" A2:"+inputs['A2']+" A3:"+inputs['A3']);
		//console.log();
    }
	//每次传递一个字节进来，从而得到一个完整帧
	function GetFrame(ch) {
	 	if(FrameStep>=MAX_FRAME_SZ)
			FrameStep=0;    
        if(FrameStep==0){//等待接收帧头 
			if(ch==0xaa){
				FrameStep=1;
				FrameBuf[0]=ch;
			}
		}
		else if(FrameStep==1){//接收命令  
	    	FrameStep=2;
			FrameBuf[1]=ch;
		}
		else if(FrameStep==2){//接收长度低8位
			FrameBuf[2]=ch;
			FrameStep=3;
		}
		else if(FrameStep==3){//接收长度高8位
			FrameBuf[3]=ch;
			FrameStep=4;
			DataLen=FrameBuf[2]*256+FrameBuf[3];
			if(DataLen>(MAX_FRAME_SZ-6))
				FrameStep=0; 
		}
		else if((FrameStep>=4)&&(FrameStep<(4+DataLen))){
			FrameBuf[FrameStep]=ch;
			FrameStep++;
		}
		else if(FrameStep==(4+DataLen)){
			var cs=CalByteCs(FrameBuf,(DataLen+4));
			if(cs!=ch){
				FrameStep=0;
				DataLen=0;
				console.log('校验码错误,正确为:'+cs+'错误为:'+ch);
			}
			FrameBuf[FrameStep]=ch;
			FrameStep++;
		}
		else if(FrameStep==(5+DataLen)){ 
			if(ch==0x16){
				FrameBuf[FrameStep]=ch;
				FrameStep=0;
				return (DataLen+6);
		    }
		    else{
				console.log('结束符错误'+ch);
			}
			FrameStep=0;
		}
		return 0;//未找到正确帧
    }
	
	function BoardToScrath(ch) {
		if(GetFrame(ch)<=0)
			return;
		
		clearTimeout(watchdog); 
	    watchdog = null;
	
		if(FrameBuf[1]==0x83){
			GetSensorFromFrame(FrameBuf);
			//console.log('接收到板子发出的传感器');
		}
		else if(FrameBuf[1]==0x84){
			GetIRDataFromFrame(FrameBuf);
			//console.log('接收到板子发出红外编码数据');
		}
	}
/**********************************************************************************/	

   	var VarDigitIoPortMode = {
        'D1': 0,
        'D2': 0,
        'D3': 0,
        'D4': 0,
        'IR': 1
   	};
  	var VarDigitIoPortLevel = {
        'D1': 0,
        'D2': 0,
        'D3': 0,
        'D4': 0,
        'D5': 0
   	};
		//周期和宽度为两个字节，最大65535，单位us
   	var VarAnalogOutPortPeriod = {
        'PWM': 0
   	};
	
   	var VarAnalogOutPortWidth = {
        'PWM': 0
   	};
	
  	function SetDigitIoPortToFrame(prm){	
		var tmp=0x00;		//mode   
		if(prm['D1'])
			tmp=tmp|(1<<0);
		   
		if(prm['D2'])
			tmp=tmp|(1<<1);
		 
		if(prm['D3'])
			tmp=tmp|(1<<2);
		  
		if(prm['D4'])
			tmp=tmp|(1<<3);
		  
		if(prm['D5'])
			tmp=tmp|(1<<4);
		  
		if(prm['IR'])
			tmp=tmp|(1<<7);
		 return tmp;
  	}
	
	function DebugControlCmd(){
		var str="工作模式-";
		if(VarDigitIoPortMode['D1']==1)
			str=str+"D1:O";
		else
			str=str+"D1:I";
		
		if(VarDigitIoPortMode['D2']==1)
			str=str+" D2:O";
		else
			str=str+" D2:I";	
		
		if(VarDigitIoPortMode['D3']==1)
			str=str+" D3:O";
		else
			str=str+" D3:I";
	
		if(VarDigitIoPortMode['D4']==1)
			str=str+" D4:O";
		else
			str=str+" D4:I";		
		
		if(VarDigitIoPortMode['IR']==1)
			str=str+" IR:O";
		else
			str=str+" IR:I";
		
		str=str+" 输出电平-";
		if(VarDigitIoPortLevel['D1']==1)
			str=str+"D1:H";
		else
			str=str+"D1:L";
		
		if(VarDigitIoPortLevel['D2']==1)
			str=str+" D2:H";
		else
			str=str+" D2:L";	
		
		if(VarDigitIoPortLevel['D3']==1)
			str=str+" D3:H";
		else
			str=str+" D3:L";
	
		if(VarDigitIoPortLevel['D4']==1)
			str=str+" D4:H";
		else
			str=str+" D4:L";	
		
		if(VarDigitIoPortLevel['D5']==1)
			str=str+" D5:H";
		else
			str=str+" D5:L";	
		
		str=str+" PWM-";
		str=str+"周期:"+VarAnalogOutPortPeriod['PWM']+"us"+"脉宽:"+VarAnalogOutPortWidth['PWM']+"us";
		console.log(str);
	}
	
	//控制命令的应用层格式
   	function SendControlCmdToUart(){
		var txbuf = new Uint8Array(MAX_FRAME_SZ);	
		txbuf[0]=0xaa;
		txbuf[1]=0x01;  
		txbuf[2]=0x00;
		txbuf[3]=0x06;
		txbuf[4]=SetDigitIoPortToFrame(VarDigitIoPortMode);
		txbuf[5]=SetDigitIoPortToFrame(VarDigitIoPortLevel);	
		txbuf[6]=VarAnalogOutPortPeriod['PWM']/256;		//pwm1
		txbuf[7]=VarAnalogOutPortPeriod['PWM']%256;
		txbuf[8]=VarAnalogOutPortWidth['PWM']/256;		//pwm1
		txbuf[9]=VarAnalogOutPortWidth['PWM']%256;
		txbuf[10]=CalByteCs(txbuf,10); 	
		txbuf[11]=0x16;
		//console.log('SendControlCmdToUart:'+txbuf.buffer);
		DebugControlCmd();
		for(var retry=0;retry<2;retry++){
			for(var i=0;i<12;i++)
			{
				device.send(new Uint8Array([txbuf[i]]).buffer);
			}
			delayms(20);
		}
    }
    //设置工作模式和IO口电平
    function SetBoardMode(which,mode,condition,buf) {
		if(mode==condition)
        	buf[which]=1; 
		else
			buf[which]=0; 
		SendControlCmdToUart();    
    }
    ext.SetDigitPortMode = function(which,mode) { return SetBoardMode(which,mode,'输出',VarDigitIoPortMode);};
   	ext.SetDigitPortLevel = function(level,which) { return SetBoardMode(which,level,'高',VarDigitIoPortLevel);};	

	//设置PWM
   	function SetPWMToPram(period,width,ch){ 
		period=period*1000;
		Math.round(period);
		if(period>65535)
	 		period=65535;
		else if(period<0)
			period=0;
	   
		var tmp=period*width/100;
		tmp=Math.round(tmp); 
	      
		console.log('period:'+period);   
		console.log('Width:'+tmp);   
	
		VarAnalogOutPortPeriod[ch]=period;
		VarAnalogOutPortWidth[ch]=tmp;
		SendControlCmdToUart();  
   	};
   	ext.SetPWMPram=function(period,width,ch) { return SetPWMToPram(period,width,ch); };
	
	//设置舵机
	function SetServoToPram(angle,ch){ 
		if((angle<0)||(angle>180))
		   return;
		
		var wd=(angle/90+0.5)*1000;
		wd=Math.round(wd); 
		
		console.log('Width:'+wd);   
	
		VarAnalogOutPortPeriod[ch]=20000;//周期定死为20ms
		VarAnalogOutPortWidth[ch]=wd;
		SendControlCmdToUart();  
   	};	
	ext.SetServo=function(angle,ch) { return SetServoToPram(angle,ch); };
	
	//设置输出频率
	ext.SetFrq=function(Hz){
		var	Period=Hz,Width=0;
		//最高不能超过100kHz
		if(Period>100000)
			Period=100000;
		
		Period=(1000000/Period);
		Period=Math.round(Period);
		VarAnalogOutPortPeriod['PWM']=Period;
		Width=Period/2;
		Width=Math.round(Width);
		VarAnalogOutPortWidth['PWM']=Width;
		SendControlCmdToUart();		
	}
	
	function SetDefaultToBoard(){
		//默认状态为输出模式，且输出电平为低
		VarDigitIoPortMode['D1']=1;
		VarDigitIoPortMode['D2']=1;
		VarDigitIoPortMode['D3']=1;
		VarDigitIoPortMode['D4']=1;
		VarDigitIoPortMode['IR']=1;
		VarDigitIoPortLevel['D1']=0;
		VarDigitIoPortLevel['D2']=0;
		VarDigitIoPortLevel['D3']=0;
		VarDigitIoPortLevel['D4']=0;
		VarDigitIoPortLevel['D5']=0;
		VarAnalogOutPortPeriod['PWM']=0;
		VarAnalogOutPortWidth['PWM']=0;
		SendControlCmdToUart();
	}
	
	//发送红外数据给板子
	function SendIRDataToBoard(text){ 
		//console.log(text);
		var	strs=new Array();
		strs=text.split(",");
		if(strs.length>(MAX_FRAME_SZ/2))
			return;
		
		//console.log("长度"+strs.length);
		var txbuf = new Uint8Array(MAX_FRAME_SZ);
		var	len=strs.length*2;
		//console.log("长度"+len);
		txbuf[0]=0xaa;
		txbuf[1]=0x02;  
		txbuf[2]=len/256;
		txbuf[3]=len%256;
		for(var i=0;i<strs.length;i++){
			var tmp=parseInt(strs[i]);
			txbuf[2*i+4]=tmp/256;
			txbuf[2*i+5]=tmp%256;
		}
		txbuf[len+4]=CalByteCs(txbuf,(len+4)); 	
		txbuf[len+5]=0x16;
		
		//重发一次防止第1包没收到
		for(var retry=0;retry<2;retry++){
			for(var i=0;i<(len+6);i++)
			{
				device.send(new Uint8Array([txbuf[i]]).buffer);
			}
		}
		delayms(300);//两次发送之间不能太快
    }
	ext.IRRemoteTx=function(data){SendIRDataToBoard(data); };
/**********************************************************************************/
// This is an extension for development and testing of the Scratch Javascript Extension API.
var LeiWeiTimeout=60000;	//乐为物联的通信超时时间
var LeiWeiGetInterval=15000;	//LeiWei获取参数的间隔时间
var YeelinkTimeout=60000;	//Yeelink的通信超时时间
var YeelinkGetInterval=15000;	//Yeelink获取参数的间隔时间
var YunSetInterval=15000;	//云服务器上参数设置间隔时间
var EnvicloudTimeout=60000;	//环境云通信超时时间
var ReadEnvicloudInterval=3000000;//50分钟读取一次 	
	
var EnvicloudCitycodeCached = {};
function fetchEnvicloudCitycode(city,callback){
	if (city in EnvicloudCitycodeCached){
		console.log('缓存的城市代码:'+EnvicloudCitycodeCached[city]);
		callback(EnvicloudCitycodeCached[city]);
		return;
	}
	
	var	Envicloudurl='http://service.envicloud.cn:8082/v2/citycode/YWJIB3R0X2NOZW4XNTAZNJMWODYZNTQ3'+'/'+city
	$.ajax({ 
    	url: Envicloudurl,
      	timeout:EnvicloudTimeout,
     	type: 'GET',
     	dataType: 'json',
      	success: function(data) { 
      		console.log('获取城市代码:'+data.citycode);
      		EnvicloudCitycodeCached[city]=data.citycode;
      		callback(data.citycode)
      	},
      	error: function(XMLHttpRequest, textStatus){
			console.log('Error:'+textStatus);
		},
  	});	
}	
/*
 以下为获取天气相关函数
 */
var EnvicloudWeatherCached = {};
function fetchEnvicloudWeather(city,callback){
	if (city in EnvicloudWeatherCached && Date.now() - EnvicloudWeatherCached[city].time < 3000000) {
		console.log('取缓冲的气候数据:'+EnvicloudWeatherCached[city].data); 
      		callback(EnvicloudWeatherCached[city].data);
		return;
    }
	
	fetchEnvicloudCitycode(city,function(citycode){
		var	url='http://service.envicloud.cn:8082/v2/weatherlive/YWJIB3R0X2NOZW4XNTAZNJMWODYZNTQ3/'+citycode;
		$.ajax({ 
    		url: url,
      		timeout:EnvicloudTimeout,
     		type: 'GET',
     		dataType: 'json',
      		success: function(weatherData) { 
			console.log('获取气候数据:'+weatherData); 
      			EnvicloudWeatherCached[city] = {data: weatherData, time: Date.now()};
      			callback(weatherData);
      		},
      		error: function(XMLHttpRequest, textStatus){
				console.log('Error:'+textStatus);
			},
  		});
	});
}


function getEnvicloudWeatherDataFromJSOP(type,weatherData){
	var val = null;
    switch (type) {
      	case '温度'://气温(℃) 
       	 	val = weatherData.temperature;
        	break;
        case '体感温度'://体感温度(℃) 
       	 	val = weatherData.feelst;
        	break;
      	case '湿度'://相对湿度(%) 
        	val = weatherData.humidity;
        	break;
      	case '风速'://风速(m/s
        	val = weatherData.windspeed;
        	break;
		case '大气压'://气压(hPa) 
        	val = weatherData.airpressure;	
        	break;
        case '降雨量'://降雨量(mm)
        	val = weatherData.rain;				
        	break;
   	} 
    return val;
}	

ext.GetEnvicloudWeather=function(city,type,callback){
	fetchEnvicloudWeather(city,function(data) {
		var ret=getEnvicloudWeatherDataFromJSOP(type,data);
		console.log('返回值：'+ret); 
		callback(ret);
	});
};
	
/*
 以下为获取空气质量相关函数
 */
var EnvicloudAirCached = {};
function fetchEnvicloudAir(city,callback){
	if (city in EnvicloudAirCached &&Date.now() - EnvicloudAirCached[city].time < 3000000) {
      	//Weather data is cached
		console.log('取缓冲区:'+EnvicloudAirCached[city].data); 
      	callback(EnvicloudAirCached[city].data);
		return;
    }
	fetchEnvicloudCitycode(city,function(citycode){
		var	url='http://service.envicloud.cn:8082/v2/cityairlive/YWJIB3R0X2NOZW4XNTAZNJMWODYZNTQ3/'+citycode;
		$.ajax({ 
    		url: url,
      		timeout:EnvicloudTimeout,
     		type: 'GET',
     		dataType: 'json',
      		success: function(airData) { 
			console.log('取云服务器空气质量:'+airData); 
      			EnvicloudAirCached[city] = {data: airData, time: Date.now()};
      			callback(airData);
      		},
      		error: function(XMLHttpRequest, textStatus){
				console.log('Error:'+textStatus);
			},
  		});
	});
}

function getEnvicloudAirDataFromJSOP(type,airData){
	var val = null;
    switch (type) {
    	case '空气质量指数'://空气质量指数
    		val = airData.AQI;
    		break;
      	case 'PM2.5'://PM2.5浓度(μg/m3)
       	 	val = airData.PM25;			
        	break;
      	case 'PM10'://PM10浓度(μg/m3)					
        	val = airData.PM10;
        	break;
        case '一氧化碳浓度'://一氧化碳浓度(mg/m3)					
        	val = airData.CO;
        	break;	
      	case '二氧化硫浓度'://二氧化硫浓度(μg/m3)
        	val = airData.SO2;	
        	break;
        case '二氧化氮浓度'://二氧化氮浓度(μg/m3)
        	val = airData.NO2;	
        	break;	
		case '臭氧浓度'://臭氧浓度(μg/m3)
        	val = airData.o3;
        	break;		
   	}
    return val;
}	

ext.GetEnvicloudAir=function(city,type,callback){
	fetchEnvicloudAir(city,function(data) {
		var ret=getEnvicloudAirDataFromJSOP(type,data);
		console.log('返回值：'+ret); 
		callback(ret);
	});
};
	
/**********************************************************************************/
/******************************************************/
//https://www.tlink.io/index.htm
var TinkTimeout=60000;		//Tlink的通信超时时间
var TlinkGetInterval=15000;	//Tlink获取参数的间隔时间
var TlinkCached = {};

var IotSetTime = {};
function CheckIotTimeInterval(type,ms){
	if (type in IotSetTime &&Date.now() - IotSetTime[type].time < ms) {
		console.log('时间未到:'+(Date.now() - IotSetTime[type].time)/1000);
		return false;
    }
	else{
		IotSetTime[type] = {time: Date.now()};
		return true;
	}
}
	
ext.SetTlink= function(device,sensor,value){
	//15s内不得连续发送请求
	if(CheckIotTimeInterval('Tlink',YunSetInterval)==false)
		return;
	
	var	linkurl='http://localhost:9000/tlink/'+'createDataPonit.htm';
	var	postdata='{"deviceNo":"'+device+'","sensorDatas":[{"sensorsId":'+sensor+',"value":"'+value+'"}]}';
	console.log(postdata);
	$.ajax({ 
    	url: linkurl,
    	async: false,
      	timeout:TinkTimeout,
     	type: 'post',
     	data: postdata,
     	dataType: 'json',
      	success: function(data) { 
      		console.log(data.msg);
      		console.log(data.flag);
      	},
      	error: function(XMLHttpRequest, textStatus){
			console.log('Error:'+textStatus);
		},
  	});	
}

ext.GetTlink=function (sensor,callback){
	var	linkurl='http://localhost:9000/tlink/'+'getDataPoint_'+sensor+'.htm'

	if (sensor in TlinkCached){
		var time=Date.now() - TlinkCached[sensor].time;
		if(time<TlinkGetInterval){
			console.log('取缓冲区:'+TlinkCached[sensor].data); 
			callback(TlinkCached[sensor].data);
			return;
		}
    }
      	
	$.ajax({ 
    	url: linkurl,
      	timeout:TinkTimeout,
     	type: 'GET',
     	dataType: 'json',
      	success: function(data) { 
      		if("switcher" in data) {
      			var tmp=data.switcher;
      		}
      		else if("value" in data) {
      			var tmp=data.value;
      		}
      		var ret=parseFloat(tmp);
      		console.log('取传感器值:'+tmp);
      		TlinkCached[sensor] = {data: tmp, time: Date.now()};
      		callback(tmp);
      		return;
      	},
      	error: function(XMLHttpRequest, textStatus){
			console.log('Error:'+textStatus);
			callback('error');
			return;
		},
  	});		
}
/******************************************************/
ext.resetAll = function(){
	SetDefaultToBoard();
};
ext._deviceRemoved = function(dev) {
    if(device != dev) return;
    device = null;
};

 ext._shutdown = function() {
    if(device) device.close();
    device = null;
};

ext._getStatus = function() {
        if(!device) return {status: 1, msg: 'ScratchMiniBoard disconnected'};
        if(watchdog) return {status: 1, msg: 'Probing for ScratchMiniBoard'};
    	return {status: 2, msg: 'ScratchMiniBoard connected'};
}	
	
/******************************************************/
    var descriptor = {
        blocks: [
        	[' ', '设置数字 %m.DigitalInOutPort 脚为 %m.DigitalIOmode', 'SetDigitPortMode', 'D1', '输入'],
            [' ', '输出 %m.DigitalIOOutType 电平到 数字 %m.DigitalOutPort 脚', 'SetDigitPortLevel', '低', 'D1'],
            ['r', ' %m.AllInPort 脚的输入值', 'sensor', 'D1'],
			[' ', '输出 %n Hz信号到 %m.AnalogOutPortName 脚', 'SetFrq', 200 ,'PWM'],
	    	[' ', '输出 %n (0~180)角度到模拟输出脚 %m.AnalogOutPortName (舵机)', 'SetServo', 90 ,'PWM'],
			[' ', '输出周期为 %n ms 占空比为 %n (0~100%)的信号到 %m.AnalogOutPortName 脚', 'SetPWMPram', 40 , 50 ,'PWM'],
	    	['R', '城市:%s 的 %m.WeatherDataType 值 ', 'GetEnvicloudWeather', '北京', '温度'],
	    	['R', '城市:%s 的 %m.AirDataType 值 ', 'GetEnvicloudAir', '北京', 'PM2.5'],	
			['R', '获取TLINK传感器为 %s 的值','GetTlink','200111797'],
	    	[' ', '设置TLINK设备为 %s  传感器为 %s 的值为 %n','SetTlink','576Y1MP1S9722J7V' ,'200111798','11'],
			['r', '接收红外遥控编码', 'IRRemoteRx'],
			[' ', '发送红外遥控编码 %s', 'IRRemoteTx','513,1000,1513,1111']
	],
        menus: {
			AllInPort:['D1','D2','D3','D4','A1','A2','A3'],
            DigitalInOutPort:['D1','D2','D3','D4','IR'],
			DigitalOutPort:['D1','D2','D3','D4','D5'],
  	    	DigitalIOmode:['输入','输出'],
  	    	DigitalIOOutType:['低','高'],	
  	    	AnalogInPortName:['A1','A2','A3'],
  	    	AnalogOutPortName:['PWM'],
	    	WeatherDataType:['温度', '体感温度','湿度', '风速','大气压','降雨量'],
	    	AirDataType:['空气质量指数', 'PM2.5','PM10', '一氧化碳浓度','二氧化硫浓度','二氧化氮浓度','臭氧浓度'],
        },
        url: 'https://shop332325555.taobao.com'
    };
    ScratchExtensions.register('Scratch Iot Board', descriptor, ext, {type: 'serial'});
})({});
