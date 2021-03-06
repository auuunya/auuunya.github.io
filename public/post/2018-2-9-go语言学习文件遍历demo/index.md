# Golang文件夹遍历Demo


**主函数**:
```go
//传递一个string类型，在这里我们传入需要扫描的路径
func getFilelist(path string){
	//package_name:path/filepath
	//go doc filepath.Walk 查看这个函数的文档
	err:=filepath.Walk(path,func (path string,f os.FileInfo,err error) error {
		//如果f等于空，返回err错误
		if (f==nil){return err}
		//func IsDir() bool  // abbreviation for Mode().IsDir()
		if f.IsDir(){return nil}
		println(path)
		return nil
	})
	if err!=nil{
		fmt.Printf("filepath.Walk() returned %v\n",err)
	}
}
```
<!--more-->
**main入口函数:**

[flag](https://books.studygolang.com/The-Golang-Standard-Library-by-Example/chapter13/13.1.html)-命令行参数解析

在写命令行程序（工具、server）时，对命令参数进行解析是常见的需求。各种语言一般都会提供解析命令行参数的方法或库，以方便程序员使用。如果命令行参数纯粹自己写代码解析，对于比较复杂的，还是挺费劲的。在 go 标准库中提供了一个包：flag，方便进行命令行解析

**注:区分几个概念**
1. 命令行参数（或参数）：是指运行程序提供的参数
2. 已定义命令行参数：是指程序中通过flag.Xxx等这种形式定义了的参数
3. 非flag（non-flag）命令行参数（或保留的命令行参数）：后文解释

```go
func main(){
        flag.Parse()
        root := flag.Arg(0)
        getFilelist(root)
}
```

**运行实例:**

```go
go run filepath.go f:\
...
```


