self.addEventListener('message',async function(e){
    let value = e.data;
    if(value > 0){
        while(value > 0){
            await delay(1);
            this.postMessage(value);
            value--;
        }
    }else{
        while(value < 0){
            await delay(1);
            this.postMessage(value);
            value++;
        }
    }
    
})

const delay = ms => new Promise(res => setTimeout(res, ms));