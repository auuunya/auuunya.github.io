# Golang上传文件到七牛云


--------
最近老大说要在网站的后台里做一个OSS配置，后台写好，图片直接上传到云储存里面，小生不才，查资料看文章，改了N多BUG之后才做了一个基本的上传系统,下面是一些在敲代码中经历的BUG或者对一些方法的见解

--------

<!--more-->

### 获取
首先要获取的是七牛云官方的SDK
```go
go get -u github.com/qiniu/api.v7
```

### 七牛云
- [七牛云](https://www.qiniu.com/)没有帐号的去注册一个帐号。
- [个人中心](https://portal.qiniu.com/user/key)有账号的直接进个人中心，去查看秘钥	AccessKey/SecretKey

### 代码
一些常变量
```go
const (
	//本地保存的文件夹名称
	upload_path string = "/files/"
)

var (
	//BUCKET是你在存储空间的名称
	ACCESS_KEY = "******EA09VCy5EfN_*******************"
	SECRET_KEY = "******-yvwcYwImN6F*******************"
	BUCKET     = "bucket"
)
```
##### `WEB`端代码
**获取上传的文件**
```go
func uploadHandle(w http.ResponseWriter, r *http.Request) {
	//从请求当中判断方法
	if r.Method == "GET" {
		tmp, err := template.ParseFiles("templates/upload.html")
		if err != nil {
			fmt.Println("模版渲染失败")
		}
		tmp.Execute(w, nil)
	} else {
		//获取文件内容 要这样获取
		file, head, err := r.FormFile("file")
		if err != nil {
			fmt.Println(err)
			return
		}
		defer file.Close()
		//创建文件夹
		pwd, _ := os.Getwd()
		//文件夹存在的话会返回一个错误，可以用`_`抛出去
		err = os.Mkdir(pwd+upload_path, os.ModePerm)
		if err != nil {
			fmt.Println("dir is create Error")
		}
		fW, err := os.Create(pwd + upload_path + head.Filename)
		if err != nil {
			fmt.Println("文件创建失败")
			return
		}
		fmt.Println(*fW)
		defer fW.Close()
		//复制文件，保存到本地
		_, err = io.Copy(fW, file)
		if err != nil {
			fmt.Println("文件保存失败")
			return
		}
		//调用七牛上传函数
		upload_qiniu(pwd + upload_path + head.Filename)
		http.Redirect(w, r, "/", http.StatusFound)
	}
}
```
**七牛云上传函数**
```go
func upload_qiniu(filePath string) {
	key := "github-x.png"
	//上传凭证,关于凭证这块大家可以去看看官方文档
	putPolicy := storage.PutPolicy{
		Scope: BUCKET,
	}
	mac := qbox.NewMac(ACCESS_KEY, SECRET_KEY)
	upToken := putPolicy.UploadToken(mac)
	cfg := storage.Config{}
	//空间对应机房
	//其中关于Zone对象和机房的关系如下：
	//	机房	Zone对象
	//	华东	storage.ZoneHuadong
	//	华北	storage.ZoneHuabei
	//	华南	storage.ZoneHuanan
	//	北美	storage.ZoneBeimei
	//七牛云存储空间设置首页有存储区域
	cfg.Zone = &storage.ZoneHuanan
	//不启用HTTPS域名
	cfg.UseHTTPS = false
	//不使用CND加速
	cfg.UseCdnDomains = false
	//构建上传表单对象
	formUploader := storage.NewFormUploader(&cfg)
	ret := storage.PutRet{}
	// 可选
	putExtra := storage.PutExtra{
		Params: map[string]string{
			"x:name": "github logo",
		},
	}
	err := formUploader.PutFile(context.Background(), &ret, upToken, key, filePath, &putExtra)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(ret.Key, ret.Hash)
}
```

+ **整个代码最主要的是存储在本地的路径，然后在上传函数里面读取路径上传文件**
+ **可能还会有其他的方便，快捷的方法，我也还在摸索中，这个算是这几天学习的一个总结，后续还会修改代码，做一些扩展**
+ [完整代码地址](https://github.com/ma1ive/Go/blob/master/qiniu/main.go)

